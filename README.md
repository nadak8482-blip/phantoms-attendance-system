# PHANTOMS Attendance System / نظام حضور Phantoms

A responsive bilingual (English + Arabic) attendance website for a university team of 30–60 members, styled in black and red.

## Features / المميزات
- HR admin dashboard with member, event, check-in, and overall attendance-rate stats.
- Create meetings and events with opening/closing times and a late threshold.
- Generate a unique QR code for each event; members must sign in before checking in.
- Supabase Auth, PostgreSQL tables, Row Level Security (RLS), and a database RPC for validated check-ins.
- Duplicate check-ins prevented by a database unique constraint.
- Member-level reports with completed sessions, attendance, calculated absences, late arrivals, and attendance percentage.
- Search reports by member/committee, filter by meeting or event, and export visible rows as CSV.
- Absences are calculated from completed events only. Members are counted only for events ending on or after their profile creation date, so sessions before joining do not count against them.
- Responsive layout for phones and desktop.

## Files / الملفات
- `index.html` — page structure and bilingual interface.
- `styles.css` — black/red responsive theme.
- `app.js` — authentication, event creation, QR, check-in, dashboard, reports and CSV export.
- `supabase.sql` — database schema, indexes, RLS policies and secure check-in RPC.

## Setup / الإعداد
1. Create a project at https://supabase.com/.
2. In Supabase SQL Editor, run all of `supabase.sql`.
3. In Project Settings → API, copy the Project URL and anon/public key. Paste them into `SUPABASE_URL` and `SUPABASE_ANON_KEY` at the top of `app.js`. **Never put the `service_role` key in frontend code.**
4. In Supabase Authentication → Users, create your HR user. Copy its UUID.
5. In SQL Editor, insert your admin profile (replace the UUID and name):

   ```sql
   insert into public.profiles (id, full_name, team, role, active)
   values ('YOUR_AUTH_USER_UUID', 'Phantoms HR', 'HR', 'admin', true);
   ```

6. Create a Supabase Auth account for every member, then insert a profile row for each account:

   ```sql
   insert into public.profiles (id, full_name, team, role, active)
   values ('MEMBER_AUTH_USER_UUID', 'Member Name', 'Committee Name', 'member', true);
   ```

7. Serve the folder over HTTP rather than opening it as `file://`. For example, run `python -m http.server 8000` from this folder and open `http://localhost:8000`.
8. Deploy the folder to a static host such as Netlify or Vercel. Use the final HTTPS URL when generating QR codes. Create new events after deployment so the QR codes use the deployed domain.
9. Sign in as HR, create an event, and share/print its QR. Members scan the code, sign in, and confirm attendance.

## Attendance report logic / طريقة الحساب
- **Completed sessions:** events whose end time has passed, optionally filtered by meeting/event type.
- **Attended:** distinct completed events with a valid attendance row for the member.
- **Absent:** eligible completed events minus attended events.
- **Late:** attendance rows marked late by the database check-in function.
- **Attendance rate:** attended ÷ eligible completed events × 100.
- Events that ended before the member's profile creation date are excluded from that member's denominator.
- CSV export follows the current type filter and search query.

## Security notes / ملاحظات الأمان
- The QR URL identifies the event; it is not proof of identity. Authentication is required.
- Check-in is validated in the database: active profile, event window, late threshold and duplicate prevention.
- Attendance has no direct member insert/update/delete policy; writes go through the validated RPC.
- Admin reports depend on the `is_active_admin()` RLS policy. Keep admin access restricted and never expose the service-role key.
- Absence is derived for reporting; it is not stored as an attendance row. If you later need approved excuses or manual attendance corrections, add an audited HR workflow rather than editing records directly.
