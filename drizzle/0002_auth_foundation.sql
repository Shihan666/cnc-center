CREATE TYPE "public"."admin_auth_throttle_scope" AS ENUM('password_account', 'password_ip', 'mfa_account', 'mfa_ip');--> statement-breakpoint
CREATE TYPE "public"."admin_login_challenge_type" AS ENUM('enrollment', 'mfa');--> statement-breakpoint
CREATE TYPE "public"."admin_session_auth_method" AS ENUM('totp', 'recovery');--> statement-breakpoint
CREATE TABLE "admin_auth_throttles" (
	"scope" "admin_auth_throttle_scope" NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_failure_at" timestamp with time zone,
	"blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_auth_throttles_pkey" PRIMARY KEY("scope","key_hash"),
	CONSTRAINT "admin_auth_throttles_key_hash_format" CHECK (
          "admin_auth_throttles"."key_hash"
          ~
          '^[0-9a-f]{64}$'
        ),
	CONSTRAINT "admin_auth_throttles_failure_nonnegative" CHECK ("admin_auth_throttles"."failure_count" >= 0),
	CONSTRAINT "admin_auth_throttles_last_failure_not_before_window" CHECK (
          "admin_auth_throttles"."last_failure_at" is null
          or
          "admin_auth_throttles"."last_failure_at"
          >=
          "admin_auth_throttles"."window_started_at"
        )
);
--> statement-breakpoint
CREATE TABLE "admin_login_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"type" "admin_login_challenge_type" NOT NULL,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_login_challenges_token_hash_format" CHECK (
          "admin_login_challenges"."token_hash"
          ~
          '^[0-9a-f]{64}$'
        ),
	CONSTRAINT "admin_login_challenges_attempt_range" CHECK (
          "admin_login_challenges"."attempt_count" >= 0
          and
          "admin_login_challenges"."attempt_count" <= 5
        ),
	CONSTRAINT "admin_login_challenges_expiry_after_created" CHECK (
          "admin_login_challenges"."expires_at"
          >
          "admin_login_challenges"."created_at"
        ),
	CONSTRAINT "admin_login_challenges_terminal_state_exclusive" CHECK (
          not (
            "admin_login_challenges"."consumed_at" is not null
            and
            "admin_login_challenges"."invalidated_at" is not null
          )
        ),
	CONSTRAINT "admin_login_challenges_consumed_not_before_created" CHECK (
          "admin_login_challenges"."consumed_at" is null
          or
          "admin_login_challenges"."consumed_at"
          >=
          "admin_login_challenges"."created_at"
        ),
	CONSTRAINT "admin_login_challenges_invalidated_not_before_created" CHECK (
          "admin_login_challenges"."invalidated_at" is null
          or
          "admin_login_challenges"."invalidated_at"
          >=
          "admin_login_challenges"."created_at"
        )
);
--> statement-breakpoint
CREATE TABLE "admin_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_recovery_codes_hash_format" CHECK (
          "admin_recovery_codes"."code_hash"
          ~
          '^[0-9a-f]{64}$'
        ),
	CONSTRAINT "admin_recovery_codes_terminal_state_exclusive" CHECK (
          not (
            "admin_recovery_codes"."used_at" is not null
            and
            "admin_recovery_codes"."revoked_at" is not null
          )
        ),
	CONSTRAINT "admin_recovery_codes_used_not_before_created" CHECK (
          "admin_recovery_codes"."used_at" is null
          or
          "admin_recovery_codes"."used_at"
          >=
          "admin_recovery_codes"."created_at"
        ),
	CONSTRAINT "admin_recovery_codes_revoked_not_before_created" CHECK (
          "admin_recovery_codes"."revoked_at" is null
          or
          "admin_recovery_codes"."revoked_at"
          >=
          "admin_recovery_codes"."created_at"
        )
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"auth_method" "admin_session_auth_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" varchar(64),
	CONSTRAINT "admin_sessions_token_hash_format" CHECK (
          "admin_sessions"."token_hash"
          ~
          '^[0-9a-f]{64}$'
        ),
	CONSTRAINT "admin_sessions_idle_after_created" CHECK (
          "admin_sessions"."idle_expires_at"
          >
          "admin_sessions"."created_at"
        ),
	CONSTRAINT "admin_sessions_absolute_after_created" CHECK (
          "admin_sessions"."absolute_expires_at"
          >
          "admin_sessions"."created_at"
        ),
	CONSTRAINT "admin_sessions_idle_not_after_absolute" CHECK (
          "admin_sessions"."idle_expires_at"
          <=
          "admin_sessions"."absolute_expires_at"
        ),
	CONSTRAINT "admin_sessions_last_seen_not_before_created" CHECK (
          "admin_sessions"."last_seen_at"
          >=
          "admin_sessions"."created_at"
        ),
	CONSTRAINT "admin_sessions_revocation_pair" CHECK (
          (
            "admin_sessions"."revoked_at" is null
            and
            "admin_sessions"."revocation_reason" is null
          )
          or
          (
            "admin_sessions"."revoked_at" is not null
            and
            "admin_sessions"."revocation_reason" is not null
            and
            char_length(
              btrim(
                "admin_sessions"."revocation_reason"
              )
            ) > 0
          )
        ),
	CONSTRAINT "admin_sessions_revoked_not_before_created" CHECK (
          "admin_sessions"."revoked_at" is null
          or
          "admin_sessions"."revoked_at"
          >=
          "admin_sessions"."created_at"
        )
);
--> statement-breakpoint
CREATE TABLE "admin_totp_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"secret_ciphertext" "bytea" NOT NULL,
	"secret_nonce" "bytea" NOT NULL,
	"secret_auth_tag" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"last_used_counter" bigint,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_totp_factors_ciphertext_nonempty" CHECK (
          octet_length(
            "admin_totp_factors"."secret_ciphertext"
          ) > 0
        ),
	CONSTRAINT "admin_totp_factors_nonce_length" CHECK (
          octet_length(
            "admin_totp_factors"."secret_nonce"
          ) = 12
        ),
	CONSTRAINT "admin_totp_factors_auth_tag_length" CHECK (
          octet_length(
            "admin_totp_factors"."secret_auth_tag"
          ) = 16
        ),
	CONSTRAINT "admin_totp_factors_key_version_positive" CHECK ("admin_totp_factors"."key_version" >= 1),
	CONSTRAINT "admin_totp_factors_counter_nonnegative" CHECK (
          "admin_totp_factors"."last_used_counter" is null
          or
          "admin_totp_factors"."last_used_counter" >= 0
        ),
	CONSTRAINT "admin_totp_factors_confirmed_not_before_created" CHECK (
          "admin_totp_factors"."confirmed_at" is null
          or
          "admin_totp_factors"."confirmed_at"
          >=
          "admin_totp_factors"."created_at"
        )
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_canonical" CHECK (
          "admins"."email"
          =
          lower(
            btrim("admins"."email")
          )
        ),
	CONSTRAINT "admins_email_nonempty" CHECK (
          char_length(
            btrim("admins"."email")
          ) > 0
        ),
	CONSTRAINT "admins_password_hash_nonempty" CHECK (
          char_length(
            "admins"."password_hash"
          ) > 0
        )
);
--> statement-breakpoint
ALTER TABLE "admin_login_challenges" ADD CONSTRAINT "admin_login_challenges_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_totp_factors" ADD CONSTRAINT "admin_totp_factors_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_auth_throttles_blocked_idx" ON "admin_auth_throttles" USING btree ("blocked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_login_challenges_token_hash_unique" ON "admin_login_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_login_challenges_active_admin_unique" ON "admin_login_challenges" USING btree ("admin_id") WHERE 
            "admin_login_challenges"."consumed_at" is null
            and
            "admin_login_challenges"."invalidated_at" is null
          ;--> statement-breakpoint
CREATE INDEX "admin_login_challenges_expires_idx" ON "admin_login_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_recovery_codes_code_hash_unique" ON "admin_recovery_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "admin_recovery_codes_admin_idx" ON "admin_recovery_codes" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_recovery_codes_active_admin_idx" ON "admin_recovery_codes" USING btree ("admin_id") WHERE 
            "admin_recovery_codes"."used_at" is null
            and
            "admin_recovery_codes"."revoked_at" is null
          ;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_active_expiry_idx" ON "admin_sessions" USING btree ("idle_expires_at","absolute_expires_at") WHERE "admin_sessions"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_totp_factors_admin_unique" ON "admin_totp_factors" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admins_email_unique" ON "admins" USING btree ("email");
--> statement-breakpoint
-- Runtime least-privilege contract for Phase 13E-5.
REVOKE ALL PRIVILEGES ON TABLE "admins", "admin_sessions", "admin_login_challenges", "admin_totp_factors", "admin_recovery_codes", "admin_auth_throttles" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "admins", "admin_sessions", "admin_login_challenges", "admin_totp_factors", "admin_recovery_codes", "admin_auth_throttles" FROM "cnc_center_app";
--> statement-breakpoint
GRANT SELECT ON TABLE "admins" TO "cnc_center_app";
--> statement-breakpoint
GRANT UPDATE ("last_login_at", "password_hash", "password_changed_at", "updated_at") ON TABLE "admins" TO "cnc_center_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "admin_sessions" TO "cnc_center_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "admin_login_challenges" TO "cnc_center_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "admin_totp_factors" TO "cnc_center_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "admin_recovery_codes" TO "cnc_center_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "admin_auth_throttles" TO "cnc_center_app";
