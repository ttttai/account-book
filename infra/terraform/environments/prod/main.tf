locals {
  common_labels = merge(
    {
      application = "account-book"
      environment = "prod"
      managed_by  = "terraform"
    },
    var.labels,
  )
}

data "google_service_account" "cloud_run" {
  project    = var.project_id
  account_id = var.cloud_run_service_account_id
}

data "google_secret_manager_secret" "allowed_google_emails" {
  project   = var.project_id
  secret_id = var.allowed_google_emails_secret_id
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
      image = var.container_image

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
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    precondition {
      condition     = startswith(var.container_image, "${var.region}-docker.pkg.dev/${var.project_id}/")
      error_message = "container imageは同じproject・regionのArtifact Registryから指定してください。"
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
