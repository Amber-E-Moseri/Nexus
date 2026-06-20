-- Communication email templates: pre-built and customizable campaign templates

create table if not exists public.communication_email_templates (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  category        text        not null default 'announcements'
                              check (category in ('announcements', 'events', 'operational', 'celebrations')),
  html_content    text        not null,
  preview_thumbnail text,
  is_system       boolean     not null default false,
  variables       jsonb       not null default '{"headerBg":"#4C2A92","accentColor":"#E8A020","footerText":"BLW CAN NEXUS"}'::jsonb,
  created_by      uuid        references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Enable RLS
alter table public.communication_email_templates enable row level security;

-- Policies: authenticated users can view all, super_admin/dept_lead can create/update/delete
create policy "email_templates_select"
  on public.communication_email_templates
  for select
  to authenticated
  using (true);

create policy "email_templates_insert"
  on public.communication_email_templates
  for insert
  to authenticated
  with check ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead'));

create policy "email_templates_update"
  on public.communication_email_templates
  for update
  to authenticated
  using ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead') or created_by = auth.uid());

create policy "email_templates_delete"
  on public.communication_email_templates
  for delete
  to authenticated
  using ((auth.jwt() ->> 'role') = 'super_admin' or (created_by = auth.uid() and not is_system));

-- Indexes
create index if not exists idx_email_templates_category on public.communication_email_templates(category);
create index if not exists idx_email_templates_is_system on public.communication_email_templates(is_system);
create index if not exists idx_email_templates_created_by on public.communication_email_templates(created_by);

-- Trigger for updated_at
create trigger trg_email_templates_updated_at
  before update on public.communication_email_templates
  for each row
  execute function public.set_updated_at();

-- Seed: 8 pre-built templates
insert into public.communication_email_templates (name, category, html_content, is_system, variables)
values
  (
    'Weekly Ministry Update',
    'announcements',
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="background:linear-gradient(135deg,{{headerBg}},#6B3FD4);padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;"><div style="color:white;font-size:18px;font-weight:800;">Weekly Update</div><div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px;">{{date_today}}</div></div><div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 20px;"><h2 style="margin:16px 0 12px;font-size:16px;">{{meeting_label}}</h2><p>{{recap}}</p><p><strong>Next meeting:</strong> {{next_date}}</p></div><div style="margin-top:24px;padding:20px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">{{footerText}} | Sent via BLW CAN NEXUS<br><a href="{{unsubscribe_link}}" style="color:#9E9488;">Unsubscribe</a></div></div>',
    true,
    '{"headerBg":"#4C2A92","accentColor":"#E8A020","footerText":"BLW CAN NEXUS"}'::jsonb
  ),
  (
    'Event Invitation',
    'events',
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="background:linear-gradient(135deg,{{headerBg}},#6B3FD4);padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;"><div style="color:white;font-size:18px;font-weight:800;">You''re Invited</div></div><div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 20px;"><p>Hi {{name}},</p><p>You''re invited to <strong>{{meeting_label}}</strong></p><div style="background:#F4F1EA;border-left:4px solid {{accentColor}};padding:12px;margin:16px 0;"><strong>Date:</strong> {{next_date}}<br><strong>Location:</strong> Check your email details</div><p><a href="#rsvp" style="display:inline-block;background:{{accentColor}};color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;">RSVP Now</a></p></div><div style="margin-top:24px;padding:20px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">{{footerText}}</div></div>',
    true,
    '{"headerBg":"#4C2A92","accentColor":"#E8A020","footerText":"BLW CAN NEXUS"}'::jsonb
  ),
  (
    'Urgent Notice',
    'operational',
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="background:#C94830;padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;"><div style="color:white;font-size:20px;font-weight:800;">⚠ Important Notice</div></div><div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 20px;"><p><strong>Hi {{name}},</strong></p><p style="font-size:15px;font-weight:700;color:#C94830;">This requires your attention.</p><p>{{recap}}</p><p><a href="#action" style="display:inline-block;background:#C94830;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Take Action</a></p></div><div style="margin-top:24px;padding:20px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">{{footerText}}</div></div>',
    true,
    '{"headerBg":"#C94830","accentColor":"#C94830","footerText":"BLW CAN NEXUS"}'::jsonb
  ),
  (
    'Graduation Celebration',
    'celebrations',
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="background:linear-gradient(135deg,#6B3FD4,#4C2A92);padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;text-align:center;"><div style="color:white;font-size:24px;font-weight:800;">🎓 Congratulations!</div></div><div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 20px;"><p>Dear {{name}},</p><p style="font-size:16px;font-weight:700;color:{{accentColor}};margin:16px 0;">We are so proud of you!</p><p>{{recap}}</p><p style="text-align:center;margin:20px 0;"><img src="#photo" alt="celebration" style="max-width:100%;border-radius:8px;"></p><p>Join us in celebrating this milestone.</p></div><div style="margin-top:24px;padding:20px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">{{footerText}} | Keep shining! 💜</div></div>',
    true,
    '{"headerBg":"#6B3FD4","accentColor":"#E8A020","footerText":"BLW CAN NEXUS"}'::jsonb
  ),
  (
    'Leadership Meeting',
    'operational',
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="background:linear-gradient(135deg,#4C2A92,#6B3FD4);padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;"><div style="color:white;font-size:18px;font-weight:800;">Leadership Meeting</div><div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:2px;">{{date_today}}</div></div><div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 20px;"><p>Hi {{name}},</p><p><strong>Agenda for {{meeting_label}}:</strong></p><ul style="margin:12px 0;padding-left:20px;"><li>Opening remarks</li><li>Ministry updates</li><li>Team discussion</li><li>Action items & next steps</li></ul><p><strong>Date:</strong> {{next_date}}</p></div><div style="margin-top:24px;padding:20px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">{{footerText}}</div></div>',
    true,
    '{"headerBg":"#4C2A92","accentColor":"#E8A020","footerText":"BLW CAN NEXUS"}'::jsonb
  ),
  (
    'Prayer Request',
    'announcements',
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="background:linear-gradient(135deg,#9A6000,#B8860B);padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;text-align:center;"><div style="color:white;font-size:20px;font-weight:800;">🙏 Prayer Request</div></div><div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 20px;text-align:center;"><p>Dear prayer warriors,</p><p style="font-style:italic;font-size:15px;margin:20px 0;line-height:1.8;">{{recap}}</p><p><strong>How to pray:</strong></p><p>Please hold this in your prayers. Every intercession matters.</p></div><div style="margin-top:24px;padding:20px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">{{footerText}} | In faith we pray</div></div>',
    true,
    '{"headerBg":"#9A6000","accentColor":"#E8A020","footerText":"BLW CAN NEXUS"}'::jsonb
  ),
  (
    'Group Signup',
    'events',
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="background:linear-gradient(135deg,{{headerBg}},#6B3FD4);padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;"><div style="color:white;font-size:18px;font-weight:800;">Join Our Group</div></div><div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 20px;"><p>Hi {{name}},</p><p>We''d love for you to join us for <strong>{{meeting_label}}</strong></p><p><strong>Details:</strong><br>When: {{next_date}}<br>What: Check your email for full details</p><p><a href="#signup" style="display:inline-block;background:{{accentColor}};color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Sign Me Up</a></p></div><div style="margin-top:24px;padding:20px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">{{footerText}} | We can''t wait to see you!</div></div>',
    true,
    '{"headerBg":"#4C2A92","accentColor":"#E8A020","footerText":"BLW CAN NEXUS"}'::jsonb
  ),
  (
    'Feedback Survey',
    'operational',
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;"><div style="background:linear-gradient(135deg,#1A56DB,#0EA5E9);padding:20px;border-radius:8px 8px 0 0;margin-bottom:24px;"><div style="color:white;font-size:18px;font-weight:800;">We''d Love Your Feedback</div></div><div style="color:#2D2A22;font-size:14px;line-height:1.7;padding:0 20px;"><p>Hi {{name}},</p><p>Your input helps us improve! Please take 2 minutes to share your thoughts on {{meeting_label}}.</p><p style="margin:20px 0;"><a href="#survey" style="display:inline-block;background:#1A56DB;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;">Take Survey</a></p><p style="font-size:12px;color:#9E9488;">Your feedback is confidential and valuable to us.</p></div><div style="margin-top:24px;padding:20px;border-top:1px solid #EDE8DC;text-align:center;font-size:11px;color:#9E9488;">{{footerText}} | Thank you!</div></div>',
    true,
    '{"headerBg":"#1A56DB","accentColor":"#1A56DB","footerText":"BLW CAN NEXUS"}'::jsonb
  )
on conflict do nothing;
