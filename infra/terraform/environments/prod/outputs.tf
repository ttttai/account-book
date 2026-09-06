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

output "weekly_line_report_job_name" {
  description = "LINE週次レポートのCloud Scheduler job名。無効時はnull"
  value       = one(google_cloud_scheduler_job.weekly_line_report[*].name)
}

output "weekly_line_report_job_url" {
  description = "Cloud Schedulerが呼ぶジョブURL（audienceと同一）。無効時はnull"
  value       = local.line_weekly_report_enabled ? local.weekly_line_report_job_url : null
}
