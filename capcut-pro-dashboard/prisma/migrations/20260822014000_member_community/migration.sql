-- Member Community V1: one shared room, no DM/member directory.
-- Additive migration only; existing Member/transaction tables are not rewritten.

CREATE TABLE member_community_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_message_id UUID NOT NULL UNIQUE,
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('member','admin')),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  sender_name_snapshot VARCHAR(255) NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  reply_to_id UUID REFERENCES member_community_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  delete_reason TEXT,
  CHECK (
    (sender_type='member' AND admin_id IS NULL) OR
    (sender_type='admin' AND member_id IS NULL)
  )
);

CREATE INDEX member_community_messages_created_idx
  ON member_community_messages(created_at DESC, id DESC);
CREATE INDEX member_community_messages_reply_idx
  ON member_community_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;
CREATE INDEX member_community_messages_member_idx
  ON member_community_messages(member_id, created_at DESC)
  WHERE member_id IS NOT NULL;

CREATE TABLE member_community_restrictions (
  member_id UUID PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','muted','banned')),
  muted_until TIMESTAMPTZ,
  reason TEXT,
  updated_by_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'muted' OR muted_until IS NOT NULL)
);

CREATE INDEX member_community_restrictions_status_idx
  ON member_community_restrictions(status, muted_until);
