# AWS EC2 + Compose Production Stack (Recommended for this repo)

This Terraform stack provisions shared platform infrastructure for compose-based runtime.

It uses:

- 1 EC2 instance (shared app + ops host)
- 1 Elastic IP
- VPC + public subnet + security group
- ECR repos for API/Web images
- S3 deploy bundle bucket
- S3 archive bucket for exported logs and, later, database backups
- IAM role for EC2 runtime
- IAM role for GitHub Actions OIDC deploy
- CloudWatch alarm + SNS topic that mail when the host stops or goes impaired

Domain routing for specific applications is intentionally handled outside this module
(app repositories and their runtime env/config).

## Directory

- `versions.tf` providers/versions
- `variables.tf` inputs
- `main.tf` resources
- `outputs.tf` values to wire into GitHub
- `templates/user-data.sh.tftpl` EC2 bootstrap
- `environments/prod.tfvars.example` starter values

## 1. Initialize Terraform

```bash
cd infra/terraform/aws-compose
terraform init
```

## 2. Plan

```bash
cp environments/prod.tfvars.example environments/prod.tfvars
# edit environments/prod.tfvars
terraform plan -var-file=environments/prod.tfvars
```

## 3. Apply

```bash
terraform apply -var-file=environments/prod.tfvars
```

## 4. Capture outputs

```bash
terraform output
terraform output -json github_actions_variables
terraform output github_deploy_role_arn
terraform output -json host_alarm
```

Use those outputs to configure GitHub Environment `production` variables/secrets.

## 5. What Terraform does not do

- It does **not** confirm the host alarm's email subscription. AWS mails a
  confirmation link to `host_alarm_email` and only a human can click it. Until
  somebody does, the alarm changes state and tells nobody — `terraform output
-json host_alarm` says so, and
  `aws sns list-subscriptions-by-topic` answers `PendingConfirmation` while it
  is still not delivering.
- It does **not** create your OpenBao secrets.
- It does **not** populate SSM env parameters.
- It does **not** unseal OpenBao after reboot.
- It does **not** configure per-application DNS hostnames.
- It does **not** install the nightly log export; that is a host cron from `scripts/`.

Use:

- `scripts/prod-deploy-remote.sh`
- `docs/deploy-aws-terraform.md`
- `docs/manual-aws-operations.md`

for operational setup and release automation.
