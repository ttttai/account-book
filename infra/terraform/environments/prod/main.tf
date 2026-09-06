locals {
  common_labels = merge(
    {
      application = "account-book"
      environment = "prod"
      managed_by  = "terraform"
    },
    var.labels,
  )

  # LINE週次レポート（INF-020, INF-021）。変数がnullの間は環境変数・secret参照・
  # scheduler jobを一切宣言せず、アプリはfail closed（NOTIF-010）で無効のまま。
  line_weekly_report_enabled = var.line_weekly_report != null
  line_weekly_report_settings = var.line_weekly_report != null ? var.line_weekly_report : {
    group_id                      = ""
    channel_secret_version        = ""
    channel_access_token_version  = ""
    notifier_database_url_version = ""
    paused                        = false
  }

  # ジョブURL・schedulerのaudience・LINE_WEEKLY_REPORT_JOB_AUDIENCEを同じ値から導出し、
  # 手入力の不一致でOIDC検証（NOTIF-006）が失敗しないようにする
  weekly_line_report_job_url = "${var.site_url}/api/v1/jobs/weekly-line-report"

  line_weekly_report_secret_env = {
    for name, ref in {
      LINE_CHANNEL_SECRET = {
        key     = "channel_secret"
        version = local.line_weekly_report_settings.channel_secret_version
      }
      LINE_CHANNEL_ACCESS_TOKEN = {
        key     = "channel_access_token"
        version = local.line_weekly_report_settings.channel_access_token_version
      }
      NOTIFIER_DATABASE_URL = {
        key     = "notifier_database_url"
        version = local.line_weekly_report_settings.notifier_database_url_version
      }
    } : name => ref if local.line_weekly_report_enabled
  }

  line_weekly_report_plain_env = {
    for name, value in {
      LINE_WEEKLY_REPORT_GROUP_ID     = local.line_weekly_report_settings.group_id
      LINE_WEEKLY_REPORT_JOB_AUDIENCE = local.weekly_line_report_job_url
      LINE_WEEKLY_REPORT_JOB_INVOKER  = one(data.google_service_account.scheduler[*].email)
    } : name => value if local.line_weekly_report_enabled
  }

  # LINE不具合報告（INF-023, INF-024）。変数がnullの間は環境変数・secret参照を一切宣言せず、
  # アプリはfail closed（LBR-010）で起票しない。LINE channelと通知用DB接続は週次レポートと共有する。
  line_bug_report_enabled = var.line_bug_report != null
  line_bug_report_settings = var.line_bug_report != null ? var.line_bug_report : {
    github_repository        = ""
    github_token_version     = ""
    allowed_user_ids_version = ""
  }

  line_bug_report_secret_env = {
    for name, ref in {
      LINE_BUG_REPORT_GITHUB_TOKEN = {
        key     = "github_token"
        version = local.line_bug_report_settings.github_token_version
      }
      LINE_BUG_REPORT_ALLOWED_USER_IDS = {
        key     = "allowed_user_ids"
        version = local.line_bug_report_settings.allowed_user_ids_version
      }
    } : name => ref if local.line_bug_report_enabled
  }

  line_bug_report_plain_env = {
    for name, value in {
      LINE_BUG_REPORT_GITHUB_REPOSITORY = local.line_bug_report_settings.github_repository
    } : name => value if local.line_bug_report_enabled
  }
}

data "google_service_account" "cloud_run" {
  project    = var.project_id
  account_id = var.cloud_run_service_account_id
}

data "google_service_account" "github_deploy" {
  project    = var.project_id
  account_id = var.github_deploy_service_account_id
}

data "google_secret_manager_secret" "allowed_google_emails" {
  project   = var.project_id
  secret_id = var.allowed_google_emails_secret_id
}

data "google_service_account" "scheduler" {
  count = local.line_weekly_report_enabled ? 1 : 0

  project    = var.project_id
  account_id = var.scheduler_service_account_id
}

data "google_secret_manager_secret" "line_weekly_report" {
  for_each = { for key, id in var.line_weekly_report_secret_ids : key => id if local.line_weekly_report_enabled }

  project   = var.project_id
  secret_id = each.value
}

data "google_secret_manager_secret" "line_bug_report" {
  for_each = { for key, id in var.line_bug_report_secret_ids : key => id if local.line_bug_report_enabled }

  project   = var.project_id
  secret_id = each.value
}

resource "google_cloud_run_v2_service" "app" {
  project             = var.project_id
  name                = var.service_name
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  labels              = local.common_labels

  template {
    service_account       = data.google_service_account.cloud_run.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      name  = "app"
      image = var.initial_container_image

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        limits = {
          "cpu"    = "1"
          "memory" = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "NEXT_PUBLIC_SITE_URL"
        value = var.site_url
      }

      env {
        name  = "NEXT_PUBLIC_SUPABASE_URL"
        value = var.supabase_url
      }

      env {
        name  = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        value = var.supabase_anon_key
      }

      env {
        name  = "NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED"
        value = "true"
      }

      env {
        name = "AUTH_ALLOWED_GOOGLE_EMAILS"

        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.allowed_google_emails.secret_id
            version = var.allowed_google_emails_version
          }
        }
      }

      # LINE週次レポートの秘密値。latestではなく指定versionを固定する（INF-021）
      dynamic "env" {
        for_each = local.line_weekly_report_secret_env

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.line_weekly_report[env.value.key].secret_id
              version = env.value.version
            }
          }
        }
      }

      dynamic "env" {
        for_each = local.line_weekly_report_plain_env

        content {
          name  = env.key
          value = env.value
        }
      }

      # LINE不具合報告の秘密値。latestではなく指定versionを固定する（INF-023）
      dynamic "env" {
        for_each = local.line_bug_report_secret_env

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.line_bug_report[env.value.key].secret_id
              version = env.value.version
            }
          }
        }
      }

      dynamic "env" {
        for_each = local.line_bug_report_plain_env

        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]

    precondition {
      condition     = startswith(var.initial_container_image, "${var.region}-docker.pkg.dev/${var.project_id}/")
      error_message = "container imageは同じproject・regionのArtifact Registryから指定してください。"
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "github_deploy" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${data.google_service_account.github_deploy.email}"
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 毎週日曜21:00 JSTに週次LINEレポートのジョブを呼ぶ（INF-020）。
# エンドポイントは冪等（NOTIF-008）なため、リトライで二重送信しない。
resource "google_cloud_scheduler_job" "weekly_line_report" {
  count = local.line_weekly_report_enabled ? 1 : 0

  project          = var.project_id
  region           = var.region
  name             = "${var.service_name}-weekly-line-report"
  description      = "Account Book weekly LINE report (Sunday 21:00 Asia/Tokyo)"
  schedule         = "0 21 * * 0"
  time_zone        = "Asia/Tokyo"
  attempt_deadline = "180s"
  paused           = local.line_weekly_report_settings.paused

  retry_config {
    retry_count          = 3
    min_backoff_duration = "300s"
    max_backoff_duration = "3600s"
    max_doublings        = 2
  }

  http_target {
    http_method = "POST"
    uri         = local.weekly_line_report_job_url
    body        = base64encode("{}")

    headers = {
      "Content-Type" = "application/json"
    }

    oidc_token {
      service_account_email = one(data.google_service_account.scheduler[*].email)
      audience              = local.weekly_line_report_job_url
    }
  }

  depends_on = [google_cloud_run_v2_service.app]
}
