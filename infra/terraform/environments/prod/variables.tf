variable "project_id" {
  description = "bootstrap済みのGoogle Cloud project ID"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_idには有効なGoogle Cloud project IDを指定してください。"
  }
}

variable "region" {
  description = "Cloud Run region"
  type        = string
  default     = "asia-northeast1"

  validation {
    condition     = var.region == "asia-northeast1"
    error_message = "MVPのproduction regionはasia-northeast1に固定します。"
  }
}

variable "service_name" {
  description = "Cloud Run service名"
  type        = string
  default     = "account-book"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,47}[a-z0-9]$", var.service_name))
    error_message = "service_nameには2〜49文字の有効なCloud Run service名を指定してください。"
  }
}

variable "cloud_run_service_account_id" {
  description = "bootstrapで作成したruntime service account ID"
  type        = string
  default     = "account-book-run"
}

variable "github_deploy_service_account_id" {
  description = "bootstrapで作成したGitHub Actions deploy service account ID"
  type        = string
  default     = "account-book-deploy"
}

variable "allowed_google_emails_secret_id" {
  description = "bootstrapで作成した許可Googleアカウント一覧のsecret ID"
  type        = string
  default     = "account-book-allowed-google-emails"
}

variable "allowed_google_emails_version" {
  description = "Cloud Runへ固定する許可Googleアカウント一覧のSecret Manager version番号"
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.allowed_google_emails_version))
    error_message = "latestではなく1以上のSecret Manager version番号を指定してください。"
  }
}

variable "initial_container_image" {
  description = "Cloud Run初回作成用のdigest固定production image。以後のimageはGitHub Actionsが管理します"
  type        = string

  validation {
    condition = can(regex(
      "^asia-northeast1-docker\\.pkg\\.dev/[a-z][a-z0-9-]{4,28}[a-z0-9]/[a-z][a-z0-9-]{2,62}/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$",
      var.initial_container_image,
    ))
    error_message = "initial_container_imageにはasia-northeast1 Artifact Registryの@sha256 digest参照を指定してください。"
  }
}

variable "site_url" {
  description = "Cloud Runまたはcustom domainのproduction HTTPS origin。末尾slashなし"
  type        = string

  validation {
    condition     = can(regex("^https://[A-Za-z0-9.-]+$", var.site_url))
    error_message = "site_urlにはpathや末尾slashを含まないHTTPS originを指定してください。"
  }
}

variable "supabase_url" {
  description = "Tokyo regionのmanaged Supabase project URL"
  type        = string

  validation {
    condition     = can(regex("^https://[a-z0-9]+\\.supabase\\.co$", var.supabase_url))
    error_message = "supabase_urlにはmanaged SupabaseのHTTPS project URLを指定してください。"
  }
}

variable "supabase_anon_key" {
  description = "browser公開用のSupabase publishable keyまたはlegacy anon key"
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.supabase_anon_key)) >= 20
    error_message = "supabase_anon_keyには空でない公開keyを指定してください。"
  }
}

variable "labels" {
  description = "Cloud Runへ付ける追加label"
  type        = map(string)
  default     = {}
}

variable "scheduler_service_account_id" {
  description = "bootstrapで作成したCloud Scheduler専用service account ID"
  type        = string
  default     = "account-book-scheduler"
}

variable "line_weekly_report_secret_ids" {
  description = "bootstrapで作成したLINE週次レポート用secret ID"
  type = object({
    channel_secret        = string
    channel_access_token  = string
    notifier_database_url = string
  })
  default = {
    channel_secret        = "account-book-line-channel-secret"
    channel_access_token  = "account-book-line-channel-access-token"
    notifier_database_url = "account-book-notifier-database-url"
  }
}

variable "line_weekly_report" {
  description = "LINE週次レポートの構成。nullのままなら環境変数・secret参照・Cloud Scheduler jobを作らず、通知機能は無効（fail closed）。有効化はsecret versionの登録後に行います"
  type = object({
    group_id                      = string
    channel_secret_version        = string
    channel_access_token_version  = string
    notifier_database_url_version = string
    paused                        = optional(bool, false)
  })
  default = null

  validation {
    condition = var.line_weekly_report == null || can(regex(
      "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
      var.line_weekly_report.group_id,
    ))
    error_message = "line_weekly_report.group_idには通知対象の家計グループID（小文字UUID）を指定してください。"
  }

  validation {
    condition = var.line_weekly_report == null || alltrue([
      for version in [
        var.line_weekly_report.channel_secret_version,
        var.line_weekly_report.channel_access_token_version,
        var.line_weekly_report.notifier_database_url_version,
      ] : can(regex("^[1-9][0-9]*$", version))
    ])
    error_message = "line_weekly_reportの各versionにはlatestではなく1以上のSecret Manager version番号を指定してください。"
  }
}
