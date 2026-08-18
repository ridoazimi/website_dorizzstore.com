-- Award Member referral points only when a transaction becomes successful.
-- Repeat customers are still recorded with zero points. Self-referrals receive zero points.
-- Attribution is only valid for the configured referral window (default 30 days).
CREATE OR REPLACE FUNCTION process_member_referral_success() RETURNS trigger AS $$
DECLARE
  m RECORD;
  u RECORD;
  prior_success INTEGER;
  reward_points INTEGER;
  referral_window_days INTEGER;
  self_ref BOOLEAN;
BEGIN
  IF NEW.status <> 'success' OR COALESCE(OLD.status,'') = 'success' OR NEW.member_referral_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value #>> '{}')::integer,30) INTO referral_window_days
  FROM member_settings WHERE key='referral_window_days';
  referral_window_days := COALESCE(referral_window_days,30);

  IF NEW.member_referral_attributed_at IS NULL
     OR NEW.member_referral_attributed_at < now() - make_interval(days => referral_window_days) THEN
    RETURN NEW;
  END IF;

  SELECT id,name,email,whatsapp,status INTO m FROM members WHERE id=NEW.member_referral_id;
  SELECT id,email,whatsapp INTO u FROM users WHERE id=NEW.user_id;
  IF m.id IS NULL OR m.status <> 'active' OR u.id IS NULL THEN RETURN NEW; END IF;

  self_ref := lower(trim(m.email)) = lower(trim(u.email)) OR
    (m.whatsapp IS NOT NULL AND u.whatsapp IS NOT NULL AND
     regexp_replace(m.whatsapp,'\D','','g') = regexp_replace(u.whatsapp,'\D','','g'));

  SELECT COUNT(*) INTO prior_success
  FROM transactions t JOIN users pu ON pu.id=t.user_id
  WHERE t.status='success' AND t.id<>NEW.id AND
    (lower(trim(pu.email))=lower(trim(u.email)) OR
     (u.whatsapp IS NOT NULL AND regexp_replace(COALESCE(pu.whatsapp,''),'\D','','g') = regexp_replace(u.whatsapp,'\D','','g')));

  SELECT COALESCE((value #>> '{}')::integer,3) INTO reward_points FROM member_settings WHERE key='referral_points';
  reward_points := COALESCE(reward_points,3);
  IF self_ref OR prior_success > 0 THEN reward_points := 0; END IF;

  INSERT INTO member_referrals(member_id,user_id,transaction_id,is_new_customer,is_self_referral,points_awarded)
  VALUES(m.id,u.id,NEW.id,prior_success=0,self_ref,reward_points)
  ON CONFLICT(transaction_id) DO NOTHING;

  IF reward_points > 0 THEN
    INSERT INTO member_point_ledger(member_id,user_id,transaction_id,source_type,points,status,note)
    VALUES(m.id,u.id,NEW.id,'referral_reward',reward_points,'available','Referral customer baru berhasil')
    ON CONFLICT DO NOTHING;
    INSERT INTO member_notifications(member_id,type,title,message,metadata)
    VALUES(m.id,'points_earned','Poin bertambah','+'||reward_points||' poin dari referral berhasil.',jsonb_build_object('transactionId',NEW.id,'points',reward_points));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_member_referral_success ON transactions;
CREATE TRIGGER trg_member_referral_success
AFTER UPDATE OF status ON transactions
FOR EACH ROW EXECUTE FUNCTION process_member_referral_success();
