#!/usr/bin/env bash
# ============================================================
# GemyAI — One-time GCP setup script
# Run this ONCE from the repo root to configure everything.
# Prerequisites: gcloud CLI installed and authenticated.
# ============================================================
set -euo pipefail

# ── Configuration ────────────────────────────────────────────
PROJECT_ID="gemy-ai"
REGION="us-central1"
SERVICE_NAME="gemyai"
REPO_NAME="gemyai"                    # Artifact Registry repo name
GITHUB_OWNER="mohamed-elzohery"
GITHUB_REPO="gemyai"
BRANCH="main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  GemyAI — Google Cloud Setup${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"

# ── Step 1: Set project ─────────────────────────────────────
echo -e "\n${YELLOW}[1/8] Setting active project to ${PROJECT_ID}...${NC}"
gcloud config set project "${PROJECT_ID}"
gcloud config set run/region "${REGION}"

# ── Step 2: Enable APIs ─────────────────────────────────────
echo -e "\n${YELLOW}[2/8] Enabling required APIs...${NC}"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  iam.googleapis.com \
  firestore.googleapis.com

# ── Step 3: Create Artifact Registry ────────────────────────
echo -e "\n${YELLOW}[3/8] Creating Artifact Registry repository...${NC}"
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="GemyAI Docker images" \
  2>/dev/null || echo "  (Repository already exists — skipping)"

# ── Step 4: Create secrets ──────────────────────────────────
echo -e "\n${YELLOW}[4/8] Creating secrets in Secret Manager...${NC}"
echo -e "  You will be prompted to enter each secret value.\n"

create_secret() {
  local name=$1
  local description=$2
  
  # Create the secret if it doesn't exist
  gcloud secrets create "${name}" \
    --replication-policy="automatic" \
    2>/dev/null || true
  
  echo -e "  Enter value for ${GREEN}${name}${NC} (${description}):"
  read -rs secret_value
  echo -n "${secret_value}" | gcloud secrets versions add "${name}" --data-file=-
  echo -e "  ${GREEN}✓${NC} ${name} set"
}

create_secret_from_file() {
  local name=$1
  local description=$2

  # Create the secret if it doesn't exist
  gcloud secrets create "${name}" \
    --replication-policy="automatic" \
    2>/dev/null || true

  echo -e "  Enter the ${GREEN}file path${NC} for ${GREEN}${name}${NC} (${description}):"
  read -r file_path
  # Expand ~ manually
  file_path="${file_path/#\~/$HOME}"
  if [[ ! -f "${file_path}" ]]; then
    echo -e "  ${RED}ERROR: File not found: ${file_path}${NC}"
    exit 1
  fi
  gcloud secrets versions add "${name}" --data-file="${file_path}"
  echo -e "  ${GREEN}✓${NC} ${name} set from ${file_path}"
}

create_secret "jwt-secret" "JWT signing secret for session cookies"
create_secret "google-oauth-client-id" "Google OAuth Client ID"
create_secret "google-oauth-client-secret" "Google OAuth Client Secret"
create_secret_from_file "firebase-service-account" "path to Firebase service account JSON file (e.g. apps/server/app/gemy-ai-firebase-adminsdk-fbsvc-c72ce2dd45.json)"

# ── Step 5: IAM — Grant roles ───────────────────────────────
echo -e "\n${YELLOW}[5/8] Configuring IAM roles...${NC}"

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Cloud Run service account needs Vertex AI access
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/aiplatform.user" \
  --quiet

# Cloud Run service account needs Secret Manager access
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

# Cloud Build needs Cloud Run deploy permission
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin" \
  --quiet

# Cloud Build needs to act as the compute service account
gcloud iam service-accounts add-iam-policy-binding "${COMPUTE_SA}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet

# Cloud Build needs Artifact Registry write access
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/artifactregistry.writer" \
  --quiet

# Cloud Build needs Secret Manager access (for reading secrets during deploy)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo -e "  ${GREEN}✓${NC} IAM configured"

# ── Step 6: Connect GitHub and create trigger ───────────────
echo -e "\n${YELLOW}[6/8] Setting up Cloud Build trigger...${NC}"
echo -e "  ${YELLOW}NOTE:${NC} If you haven't connected GitHub to Cloud Build yet,"
echo -e "  the next command will open a browser to install the Cloud Build GitHub App."
echo -e "  Press Enter to continue..."
read -r

# Create the Cloud Build trigger for pushes to main
gcloud builds triggers create github \
  --name="${SERVICE_NAME}-deploy" \
  --repo-owner="${GITHUB_OWNER}" \
  --repo-name="${GITHUB_REPO}" \
  --branch-pattern="^${BRANCH}$" \
  --build-config="cloudbuild.yaml" \
  --substitutions="_VITE_GOOGLE_CLIENT_ID=404117367631-089ihtupdrv4m542lfk8jrmo45lssjsh.apps.googleusercontent.com" \
  2>/dev/null || echo "  (Trigger may already exist — update it manually if needed)"

echo -e "  ${GREEN}✓${NC} Cloud Build trigger created for pushes to ${BRANCH}"

# ── Step 7: First manual deploy ─────────────────────────────
echo -e "\n${YELLOW}[7/8] Triggering first build & deploy...${NC}"
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual-$(date +%Y%m%d%H%M%S)")
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_VITE_GOOGLE_CLIENT_ID=404117367631-089ihtupdrv4m542lfk8jrmo45lssjsh.apps.googleusercontent.com,COMMIT_SHA=${COMMIT_SHA}"

# ── Step 8: Get the URL ─────────────────────────────────────
echo -e "\n${YELLOW}[8/8] Getting service URL...${NC}"
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format="value(status.url)")

echo -e "\n${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "\n  Service URL: ${GREEN}${SERVICE_URL}${NC}"
echo -e "\n  ${YELLOW}IMPORTANT — Next steps:${NC}"
echo -e "  1. Add ${GREEN}${SERVICE_URL}${NC} to Google OAuth authorized origins:"
echo -e "     https://console.cloud.google.com/apis/credentials"
echo -e "  2. Also add ${GREEN}${SERVICE_URL}${NC} as an authorized redirect URI"
echo -e "  3. Test the app at ${GREEN}${SERVICE_URL}${NC}"
echo -e "\n  Future deployments will trigger automatically on push to ${BRANCH}."
echo -e ""
