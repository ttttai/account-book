output "terraform_state_bucket" {
  description = "GCS backendへ指定するstate bucket名"
  value       = google_storage_bucket.terraform_state.name
}

output "artifact_registry_repository" {
  description = "production imageをpushするArtifact Registry repository"
  value       = google_artifact_registry_repository.app.name
}

output "cloud_run_service_account_email" {
  description = "Cloud Runへ割り当てるkeyless runtime identity"
  value       = google_service_account.cloud_run.email
}

output "allowed_google_emails_secret_id" {
  description = "payload versionを別途追加するSecret Manager secret ID"
  value       = google_secret_manager_secret.allowed_google_emails.secret_id
}
