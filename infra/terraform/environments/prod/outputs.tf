output "service_name" {
  description = "deployed Cloud Run service名"
  value       = google_cloud_run_v2_service.app.name
}

output "service_url" {
  description = "SupabaseとGoogle OAuthへ登録する恒久HTTPS URL"
  value       = google_cloud_run_v2_service.app.uri
}

output "initial_container_image" {
  description = "service作成に使った初回image。現在のrevisionはGitHub Actionsのdeploy記録を正本とします"
  value       = var.initial_container_image
}
