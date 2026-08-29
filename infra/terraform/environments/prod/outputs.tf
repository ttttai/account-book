output "service_name" {
  description = "deployed Cloud Run service名"
  value       = google_cloud_run_v2_service.app.name
}

output "service_url" {
  description = "SupabaseとGoogle OAuthへ登録する恒久HTTPS URL"
  value       = google_cloud_run_v2_service.app.uri
}

output "deployed_image" {
  description = "rollback記録に使うdigest固定image"
  value       = var.container_image
}
