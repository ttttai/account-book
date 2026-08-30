provider "google" {
  project = var.project_id
  region  = var.region

  # billingbudgets.googleapis.comなどbilling account単位のAPIは
  # quota projectを要求する。ローカルADCの設定に依存せず、
  # 対象projectをquota projectとして明示する。
  user_project_override = true
  billing_project       = var.project_id
}
