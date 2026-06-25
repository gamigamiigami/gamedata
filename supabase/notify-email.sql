-- ============================================================
-- IOgames 学校申請の自動メール通知（Resend + pg_net）
-- Supabase Dashboard → SQL Editor に貼り付けて「RUN」
--
-- ★事前準備：下の YOUR_RESEND_KEY を、あなたのResend APIキーに置き換える。
--   （チャットに出たキーは無効化し、新しく発行したキーを使うこと）
--
-- このキーはサーバー側の関数定義にのみ保存され、ブラウザには一切出ません。
-- 関数定義は匿名/一般ユーザーからは読めない（あなただけが見られる）。
-- ============================================================

-- pg_net 拡張（HTTPリクエストをDBから送るため）
create extension if not exists pg_net with schema extensions;

-- 申請が1件入るたびに呼ばれる関数
create or replace function public.notify_school_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_RESEND_KEY',
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'from',    'IOgames <onboarding@resend.dev>',
      'to',      jsonb_build_array('igamiigamiigami+K@gmail.com'),
      'subject', '【IOgames】新しい学校申請：' || coalesce(NEW.school_name, ''),
      'html',
        '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
        '<h2 style="color:#fed000;background:#222;padding:16px;border-radius:8px">新しい学校申請が届きました</h2>' ||
        '<p><b>学校名：</b>'   || coalesce(NEW.school_name, '')                       || '</p>' ||
        '<p><b>都道府県：</b>' || coalesce(NEW.prefecture, '')                        || '</p>' ||
        '<p><b>使う教科：</b>' || coalesce(array_to_string(NEW.subjects, '・'), '')   || '</p>' ||
        '<p><b>担当者名：</b>' || coalesce(NEW.contact_name, '')                      || '</p>' ||
        '<p><b>連絡先：</b>'   || coalesce(NEW.email, '')                             || '</p>' ||
        '<p style="margin-top:16px">管理者ダッシュボード（/admin/）で承認してください。</p>' ||
        '</div>'
    )
  );
  return NEW;
end;
$$;

-- school_applications にINSERTされたら上の関数を実行するトリガー
drop trigger if exists trg_notify_school_application on public.school_applications;
create trigger trg_notify_school_application
  after insert on public.school_applications
  for each row execute function public.notify_school_application();
