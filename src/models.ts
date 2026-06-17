/** Content moderation category labels. */
export enum ModerationLabel {
  Profanity = "profanity",
  Toxicity = "toxicity",
  Harassment = "harassment",
  Hate = "hate",
  Insult = "insult",
  Sexual = "sexual",
  SexualMinors = "sexual/minors",
  SexualExplicit = "sexual/explicit",
  Sensitive = "sensitive",
  Violence = "violence",
  SelfHarm = "self-harm",
  Medical = "medical",
  Spam = "spam",
  Promotional = "promotional",
  Scam = "scam",
  Illegal = "illegal",
}

/** Available AI moderation models. */
export enum ModerationModel {
  Auto = "auto",
  Observer = "observer",
  Sentinel = "sentinel",
  Arbiter = "arbiter",
}

/** Subscription tiers. */
export enum Tier {
  Free = "free",
  Basic = "basic",
  Standard = "standard",
  Premium = "premium",
}

/** Billing cycle options. */
export enum BillingCycle {
  Monthly = "Monthly",
  Quarterly = "Quarterly",
  Annual = "Annual",
  Triennial = "Triennial",
}

// --- Request types ---

export interface ModerationRequest {
  text?: string;
  image?: string;
  model?: ModerationModel;
  enabled_labels?: ModerationLabel[];
  include_context?: boolean;
  include_implicit?: boolean;
}

export interface BatchModerationRequest {
  texts: string[];
  images?: string[];
  model?: ModerationModel;
  enabled_labels?: ModerationLabel[];
  include_context?: boolean;
  include_implicit?: boolean;
}

export interface UsernameCheckRequest {
  username: string;
}

export interface PlatformTokenRequest {
  client_id: string;
  client_secret: string;
  grant_type: string;
}

export interface ProvisionUserRequest {
  email: string;
}

export interface PlatformModerationRequest {
  user_email: string;
  text?: string;
  image?: string;
  model?: ModerationModel;
  enabled_labels?: ModerationLabel[];
  include_context?: boolean;
  include_implicit?: boolean;
}

export interface PlatformCheckoutRequest {
  user_email: string;
  tier: Tier;
  billing_cycle: BillingCycle;
  success_url: string;
  cancel_url: string;
}

export interface ConfirmAuthorizationRequest {
  code: string;
}

// --- Response types ---

/**
 * Result of a moderation request. Label fields are plain strings (not the
 * ModerationLabel enum) so new or aliased labels returned by the server pass
 * through rather than being treated as invalid.
 */
export interface ModerationResponse {
  flagged: boolean;
  labels: string[];
  implicit_labels?: string[];
  model_version?: string;
  needs_context?: boolean;
  context_labels?: string[];
  rewritten_text?: string;
}

export interface UsernameCheckResponse {
  flagged: boolean;
  score: number;
}

export interface PlatformTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ProvisionUserResponse {
  user_id: string;
  email: string;
  is_new_account: boolean;
  is_newly_linked: boolean;
}

export interface PlatformUserInfo {
  user_id: string;
  email: string;
  linked_at: string;
  authorized: boolean;
  has_active_subscription: boolean;
  tier: Tier;
}

export interface PlatformCheckoutResponse {
  checkout_url: string;
}

export interface ConfirmAuthorizationResponse {
  user_id: string;
  email: string;
}

export interface StripeConnectStatusResponse {
  account_id?: string;
  onboarding_complete: boolean;
  charges_enabled: boolean;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}
