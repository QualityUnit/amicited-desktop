# AmICited Desktop

## Connect AmICited

Create a domain with New domain in the sidebar. Enter its website and optionally
a brand name. Chats under that domain use its website for local checks. Chats
without a domain remain in No domain. To connect AmICited from one of those
chats, create a domain first; the original conversation stays in No domain.

Each domain has its own AmICited connection. Choose Connect AmICited beside the
composer warning, or open Settings → Domains. Finish sign-in in your browser and
return to the app. You can cancel while waiting or paste a workspace key instead.
When another domain is connected, you can choose Use the same AmICited account
or connect a different account. Disconnect applies to the selected domain.

Local marketing tools work without an AmICited account. The disconnected warning
can be dismissed for each domain and never prevents sending a message. Hidden or
snoozed offers also suppress the warning.

Connecting gives access to free AmICited tools that use workspace credits;
welcome credits cover new accounts. A 7-day trial (card required) or eligible
paid plan unlocks the full set. Pro is EUR 120/month after the trial. A refusal
from a paid tool leaves local and free tools available.

### CMS and site files

Choose your CMS in New domain, or use Edit domain in its menu. For a Git-based
site, headless CMS or an unknown setup, you can choose a folder on this computer,
clone a Git URL, or skip site files. Cloning copies the site into the app's managed
folder area. The folder picker is available in the desktop app; the browser can
use a folder path on its connected computer. Framework detection helps identify
the site. Folders without Git history are allowed.

Connected site chats run in that folder and ask for your OK before edits. Changed
files · Review opens the diff after a turn. Publishing is your choice; the app
does not commit or push automatically. Close returns to the chat. If you close
New domain after copying a repository, reopen it to reuse that copy. With no connected files, the assistant
gives CMS instructions rather than claiming to edit the website.

To change a domain's folder, choose Create a new domain from this folder in its
menu. Existing chats keep their original folder and history. Edit domain updates
the website, brand and CMS; Settings → Domains shows which folder is connected.

## Issues

Issues lists what to fix on your websites, most important first. Open it from
the top of the sidebar or with Open issues in the command palette.

Connecting AmICited for a domain turns on its daily audit: every day at 06:00 an
agent reads all of that domain's AmICited reports and adds an issue for each
problem it finds. A report you have not connected yet becomes a Connect issue
at the top of the list. The first audit starts as soon as you connect. If the
computer was off or asleep at the audit time, it runs once when the app is open
again; on the desktop app, Settings in the audit line can open AmICited when the
computer starts. Change the time or add instructions there too.

Start opens a thread on the issue's domain where an agent does the fix. The
issue shows In progress while the agent works and Ready for review when it is
done. Mark it as done, or let the next audit confirm the fix. Dismiss hides an
issue the audit should not raise again; Restore brings it back. A new chat shows
the next issue to fix under the message box.
