variable "project_id" {
  description = "既存のGoogle Cloud project ID"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_idには有効なGoogle Cloud project IDを指定してください。"
  }
}

variable "region" {
  description = "Cloud Run、Artifact Registry、state bucketを配置するregion"
  type        = string
  default     = "asia-northeast1"

  validation {
    condition     = var.region == "asia-northeast1"
    error_message = "MVPのproduction regionはasia-northeast1に固定します。"
  }
}

variable "state_bucket_name" {
  description = "Terraform remote state用のglobally uniqueなGCS bucket名"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "state_bucket_nameには3〜63文字の有効なGCS bucket名を指定してください。"
  }
}

variable "artifact_registry_repository_id" {
  description = "production container image用Artifact Registry repository ID"
  type        = string
  default     = "account-book"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,62}$", var.artifact_registry_repository_id))
    error_message = "repository IDには英小文字で始まる3〜63文字を指定してください。"
  }
}

variable "cloud_run_service_account_id" {
  description = "Cloud Run runtime専用service account ID"
  type        = string
  default     = "account-book-run"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.cloud_run_service_account_id))
    error_message = "service account IDには6〜30文字の有効な値を指定してください。"
  }
}

variable "github_deploy_service_account_id" {
  description = "GitHub Actions production deploy専用service account ID"
  type        = string
  default     = "account-book-deploy"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.github_deploy_service_account_id))
    error_message = "service account IDには6〜30文字の有効な値を指定してください。"
  }
}

variable "github_repository_id" {
  description = "production deployを許可するGitHub repositoryの再利用されないnumeric ID"
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_id))
    error_message = "github_repository_idには1以上のnumeric repository IDを指定してください。"
  }
}

variable "github_repository_owner_id" {
  description = "production deployを許可するGitHub repository ownerの再利用されないnumeric ID"
  type        = string

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_owner_id))
    error_message = "github_repository_owner_idには1以上のnumeric owner IDを指定してください。"
  }
}

variable "github_workload_identity_pool_id" {
  description = "GitHub Actions用Workload Identity Pool ID"
  type        = string
  default     = "account-book-github"
}

variable "github_workload_identity_provider_id" {
  description = "GitHub OIDC用Workload Identity Provider ID"
  type        = string
  default     = "account-book-main"
}

variable "allowed_google_emails_secret_id" {
  description = "許可Googleアカウント一覧を保存するSecret Manager secret ID"
  type        = string
  default     = "account-book-allowed-google-emails"

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{1,255}$", var.allowed_google_emails_secret_id))
    error_message = "secret IDには英数字、ハイフン、underscoreだけを指定してください。"
  }
}

variable "billing_account_id" {
  description = "budgetを作成するbilling account ID。gcloud billing accounts listが出力するXXXXXX-XXXXXX-XXXXXX形式"
  type        = string

  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account_id))
    error_message = "billing_account_idはbillingAccounts/ prefixを付けず、XXXXXX-XXXXXX-XXXXXX形式で指定してください。"
  }
}

variable "monthly_budget_jpy" {
  description = "通知対象とする月額budget。費用を停止するhard capではありません"
  type        = number
  default     = 1000

  validation {
    condition     = var.monthly_budget_jpy >= 1 && floor(var.monthly_budget_jpy) == var.monthly_budget_jpy
    error_message = "monthly_budget_jpyには1以上の整数を指定してください。"
  }
}

variable "labels" {
  description = "管理対象資源へ付ける追加label"
  type        = map(string)
  default     = {}
}

variable "scheduler_service_account_id" {
  description = "LINE週次レポートのCloud Scheduler job専用service account ID"
  type        = string
  default     = "account-book-scheduler"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.scheduler_service_account_id))
    error_message = "service account IDには6〜30文字の有効な値を指定してください。"
  }
}

variable "line_bug_report_secret_ids" {
  description = "LINE不具合報告用のSecret Manager secret ID（GitHub token、許可LINE userId一覧）。payloadは管理せず、containerだけを作成します"
  type = object({
    github_token     = string
    allowed_user_ids = string
  })
  default = {
    github_token     = "account-book-line-bug-report-github-token"
    allowed_user_ids = "account-book-line-bug-report-allowed-user-ids"
  }

  validation {
    condition = alltrue([
      for id in values(var.line_bug_report_secret_ids) : can(regex("^[A-Za-z0-9_-]{1,255}$", id))
    ])
    error_message = "secret IDには英数字、ハイフン、underscoreだけを指定してください。"
  }
}

variable "line_weekly_report_secret_ids" {
  description = "LINE週次レポート用のSecret Manager secret ID。payloadは管理せず、containerだけを作成します"
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

  validation {
    condition = alltrue([
      for id in values(var.line_weekly_report_secret_ids) : can(regex("^[A-Za-z0-9_-]{1,255}$", id))
    ])
    error_message = "secret IDには英数字、ハイフン、underscoreだけを指定してください。"
  }
}
