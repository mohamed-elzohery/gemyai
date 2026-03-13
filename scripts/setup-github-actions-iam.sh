#!/usr/bin/env bash
# ============================================================
# GemyAI — One-time GitHub Actions IAM setup
#
# Creates a Workload Identity Federation pool + provider so
# GitHub Actions can authenticate to GCP without a service
# account key. Run ONCE from the repo root.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Project gemy-ai already exists
#   - scripts/setup-gcp.sh already run (APIs enabled, secrets created)
# ============================================================
set -euo pipefail

# ── Configuration ────────────────────────────────────────────
PROJECT_ID="gemy-ai"
REGION="us-central1"
GITHUB_OWNER="mohamed-elzohery"
GITHUB_REPO="gemyai"
POOL_ID="github-actions-pool"
PROVIDER_ID="github-provider"
SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  GemyAI — GitHub Actions IAM Setup${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"

# ── Step 0: Set project ─────────────────────────────────────
echo -e "\n${YELLOW}[0/6] Setting active project...${NC}"
gcloud config set project "${PROJECT_ID}"

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
echo -e "  Project number: ${GREEN}${PROJECT_NUMBER}${NC}"

# ── Step 1: Enable required APIs ────────────────────────────
echo -e "\n${YELLOW}[1/6] Enabling IAM Credentials API...${NC}"
gcloud services enable iamcredentials.googleapis.com --quiet

# ── Step 2: Create a dedicated deployer service account ─────
echo -e "\n${YELLOW}[2/6] Creating deployer service account...${NC}"
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="GitHub Actions deployer" \
  --description="Used by GitHub Actions to deploy to Cloud Run" \
  2>/dev/null || echo "  (Service account already exists — skipping)"

# Grant the deployer SA the roles it needs:
ROLES=(
  "roles/run.admin"                    # Deploy Cloud Run services
  "roles/artifactregistry.writer"      # Push Docker images
  "roles/iam.serviceAccountUser"       # Act as compute SA during deploy
)

for role in "${ROLES[@]}"; do
  echo -e "  Granting ${GREEN}${role}${NC}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${role}" \
    --quiet > /dev/null
done
echo -e "  ${GREEN}✓${NC} Deployer SA roles configured"

# ── Step 3: Create Workload Identity Pool ───────────────────
echo -e "\n${YELLOW}[3/6] Creating Workload Identity Pool...${NC}"
gcloud iam workload-identity-pools create "${POOL_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --description="WIF pool for GitHub Actions CI/CD" \
  2>/dev/null || echo "  (Pool already exists — skipping)"

# ── Step 4: Create OIDC Provider ────────────────────────────
echo -e "\n${YELLOW}[4/6] Creating OIDC provider for GitHub...${NC}"
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GITHUB_OWNER}/${GITHUB_REPO}'" \
  2>/dev/null || echo "  (Provider already exists — skipping)"

# ── Step 5: Bind the pool to the deployer SA ────────────────
echo -e "\n${YELLOW}[5/6] Binding Workload Identity Pool to deployer SA...${NC}"
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}" \
  --quiet

echo -e "  ${GREEN}✓${NC} WIF binding configured"

# ── Step 6: Print the values to add to GitHub Secrets ───────
WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo -e "\n${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e ""
echo -e "  Add these as ${YELLOW}GitHub repository secrets${NC}"
echo -e "  (Settings → Secrets and variables → Actions → New repository secret):"
echo -e ""
echo -e "  ${GREEN}GCP_PROJECT_ID${NC}        = ${PROJECT_ID}"
echo -e "  ${GREEN}GCP_WIF_PROVIDER${NC}      = ${WIF_PROVIDER}"
echo -e "  ${GREEN}GCP_SERVICE_ACCOUNT${NC}   = ${SA_EMAIL}"
echo -e "  ${GREEN}VITE_GOOGLE_CLIENT_ID${NC} = 404117367631-089ihtupdrv4m542lfk8jrmo45lssjsh.apps.googleusercontent.com"
echo -e ""
echo -e "  After adding these secrets, any push to ${YELLOW}main${NC} will"
echo -e "  automatically build and deploy to Cloud Run."
echo -e ""
