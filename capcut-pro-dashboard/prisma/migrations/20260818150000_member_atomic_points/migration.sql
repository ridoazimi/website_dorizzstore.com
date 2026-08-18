-- Atomic Member point reservation and membership exit safeguards.
-- Sales Creator tables/columns are intentionally untouched.

CREATE OR REPLACE FUNCTION reserve_member_redemption(p_member_id uuid, p_reward_id uuid)
RETURNS uuid AS $$
DECLARE
  v_member_status text;
  v_points integer;
  v_available integer;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));
  SELECT status INTO v_member_status FROM members WHERE id=p_member_id FOR UPDATE;
  IF v_member_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'MEMBER_INACTIVE'; END IF;
  SELECT points_required INTO v_points FROM member_rewards WHERE id=p_reward_id AND is_active=true;
  IF v_points IS NULL THEN RAISE EXCEPTION 'REWARD_NOT_AVAILABLE'; END IF;
  SELECT COALESCE(SUM(CASE WHEN status='available' THEN points ELSE 0 END),0)::int INTO v_available FROM member_point_ledger WHERE member_id=p_member_id;
  IF v_available < v_points THEN RAISE EXCEPTION 'INSUFFICIENT_POINTS'; END IF;
  INSERT INTO member_redemptions(member_id,reward_id,points) VALUES(p_member_id,p_reward_id,v_points) RETURNING id INTO v_id;
  INSERT INTO member_point_ledger(member_id,source_type,source_id,points,status,note) VALUES
    (p_member_id,'reward_redemption',v_id,-v_points,'available','Hold reward redemption'),
    (p_member_id,'reward_redemption_hold',v_id,v_points,'held','Hold reward redemption');
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reserve_member_withdrawal(
  p_member_id uuid, p_points integer, p_point_value integer,
  p_method text, p_account_number text, p_account_name text
) RETURNS uuid AS $$
DECLARE
  v_member_status text;
  v_available integer;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));
  SELECT status INTO v_member_status FROM members WHERE id=p_member_id FOR UPDATE;
  IF v_member_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'MEMBER_INACTIVE'; END IF;
  SELECT COALESCE(SUM(CASE WHEN status='available' THEN points ELSE 0 END),0)::int INTO v_available FROM member_point_ledger WHERE member_id=p_member_id;
  IF v_available < p_points THEN RAISE EXCEPTION 'INSUFFICIENT_POINTS'; END IF;
  INSERT INTO member_withdrawals(member_id,points,point_value_rupiah,amount_rupiah,method,account_number,account_name)
  VALUES(p_member_id,p_points,p_point_value,(p_points::bigint*p_point_value::bigint),p_method,p_account_number,p_account_name) RETURNING id INTO v_id;
  INSERT INTO member_point_ledger(member_id,source_type,source_id,points,status,note) VALUES
    (p_member_id,'cash_withdrawal',v_id,-p_points,'available','Hold cash withdrawal'),
    (p_member_id,'cash_withdrawal_hold',v_id,p_points,'held','Hold cash withdrawal');
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION exit_member_program(p_member_id uuid, p_admin_id uuid, p_reason text)
RETURNS void AS $$
DECLARE
  v_available integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));
  PERFORM 1 FROM members WHERE id=p_member_id FOR UPDATE;
  UPDATE members SET status='left',left_at=now(),updated_at=now() WHERE id=p_member_id;

  UPDATE member_redemptions SET status='rejected',rejection_reason=COALESCE(NULLIF(p_reason,''),'Member keluar dari program'),processed_at=now(),processed_by=p_admin_id
  WHERE member_id=p_member_id AND status='pending';
  UPDATE member_withdrawals SET status='rejected',rejection_reason=COALESCE(NULLIF(p_reason,''),'Member keluar dari program'),processed_at=now(),processed_by=p_admin_id
  WHERE member_id=p_member_id AND status='pending';

  UPDATE member_point_ledger SET status='forfeited',note=COALESCE(note,'')||' | Hangus karena Member keluar'
  WHERE member_id=p_member_id AND status='held';

  SELECT COALESCE(SUM(CASE WHEN status='available' THEN points ELSE 0 END),0)::int INTO v_available FROM member_point_ledger WHERE member_id=p_member_id;
  IF v_available <> 0 THEN
    INSERT INTO member_point_ledger(member_id,source_type,points,status,note,actor_admin_id)
    VALUES(p_member_id,'membership_exit',-v_available,'available',COALESCE(NULLIF(p_reason,''),'Member keluar; seluruh poin hangus'),p_admin_id);
  END IF;

  INSERT INTO member_notifications(member_id,type,title,message)
  VALUES(p_member_id,'membership_left','Keanggotaan berakhir','Keanggotaan Member berakhir dan seluruh poin telah hangus.');
END;
$$ LANGUAGE plpgsql;
