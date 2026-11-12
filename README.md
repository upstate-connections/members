# Connection Group Members Site

A private members website: unique logins, member dashboard, directory, meeting calendar with export, policies page, dues tracking (officers see everyone; members see only their own), Cash App pay button, and easy add/remove of members.

**Cost: $0** (GitHub Pages + Supabase free tier). You'll only pay for the domain when you buy it.

---

## What each part does

| Piece | Job |
|---|---|
| **GitHub Pages** | Hosts the website files (this folder) |
| **Supabase** | Stores members, events, dues, and handles logins/passwords |
| `supabase/schema.sql` | Creates the database + the security rules (who can see/edit what) |
| `js/config.js` | The only file you need to edit — connects the site to your Supabase |

---

## Setup (about 30 minutes, one time)

### 1. Create the Supabase project
1. Go to **supabase.com** → sign up (you can use GitHub) → **New project**.
2. Name it (e.g. `connection-group`), set a database password (save it somewhere), pick the **East US** region, click **Create**.

### 2. Build the database
1. In Supabase, left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql`, copy **everything**, paste it in, click **Run**. You should see "Success."
3. New query again, paste this with **your** info, and Run:
   ```sql
   insert into public.members (email, full_name, role) values ('you@example.com', 'Your Name', 'officer');
   ```
   Do the same for your boss (and the treasurer) with `'officer'`.

### 3. Connect the site to Supabase
1. Supabase → **Project Settings** (gear) → **API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `js/config.js` and paste them in place of the placeholders.

### 4. Put it on GitHub Pages
1. On github.com → **New repository** → name it (e.g. `members`) → **Public** → Create.
2. Click **uploading an existing file** and drag in everything in this folder (`index.html`, `css`, `js`, `supabase`, `README.md`). Commit.
3. Repo → **Settings** → **Pages** → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)** → Save.
4. After a minute, your site is at `https://YOUR-USERNAME.github.io/members/`.

### 5. Tell Supabase your site address
Supabase → **Authentication** → **URL Configuration**:
- **Site URL:** `https://YOUR-USERNAME.github.io/members/`
- **Redirect URLs:** add the same address.

(Without this, the confirmation and password-reset emails point to the wrong place.)

### 6. Log in
Go to your site → **First time? Create your password** → use the email you added in step 2 → click the link in the confirmation email → sign in. You'll see the **Admin** tab.

---

## Everyday use (officers)

- **Add members:** Admin → Members → **+ Add member**, or **Import CSV** (in Excel: File → Save As → CSV; needs `name` and `email` columns). Then tell them to go to the site and click **First time? Create your password** with that email. Only emails on the list can create a login.
- **Remove members:** uncheck **Active** to cut off their access but keep their history, or click **Remove** to delete them completely.
- **Dues:** Admin → Dues → check the box when someone pays (date fills in automatically). Change the period (e.g. `2027`) to start a new year. Export to CSV anytime.
- **Meetings:** Admin → Events → **+ New event**. Use "Repeat weekly" to schedule a batch at once. Members can add any event to Google Calendar or download a `.ics` file (works with Outlook and Apple Calendar).
- **Policies, welcome message, Cash App link, dues amount:** Admin → Settings.

## Adding your domain later
1. Buy the domain (Namecheap, Squarespace Domains, Cloudflare, etc.).
2. GitHub repo → Settings → Pages → **Custom domain** → enter it → follow GitHub's DNS instructions → check **Enforce HTTPS**.
3. Update the **Site URL** and **Redirect URLs** in Supabase (step 5) to the new domain.

## Good to know
- **Email limits:** Supabase's built-in email sends only a few emails per hour, which is fine for roughly 20 members signing up a few at a time. If people don't get emails, wait an hour, or connect a free SMTP service (Supabase → Authentication → Emails → SMTP settings, e.g. Resend or Brevo).
- **Free-tier pause:** Supabase pauses free projects after about a week with **no activity**. If the site ever says it can't load, log into supabase.com and click **Restore**. Regular use keeps it awake.
- **Security:** the anon key in `config.js` is meant to be public. The rules in `schema.sql` are what protect the data: non-members see nothing, members can't see other people's dues, and only officers can change things.
