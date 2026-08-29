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
