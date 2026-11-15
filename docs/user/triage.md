# Triage an issue

Triage lets your own coding agent investigate an AmICited Desktop problem. The agent
reads the logs and state of the machine, checks the AmICited Desktop source for that
version, finds known issues, and can help you write a bug report to send to
[support@flowhunt.io](mailto:support@flowhunt.io). It asks before it applies a fix.
It does not send the report for you.

## In the app

Open the command palette and choose **Triage an issue**. A new thread with no
project opens, with the triage playbook linked in the message. Choose any
provider, describe what went wrong after the link, and send. AmICited Desktop gets the
source for the server's version while you write.

Triage runs on the machine of the thread or draft that you have open. With
nothing open, it uses your primary machine if that supports triage, or else the
first connected machine that does. The new thread shows the machine name, and on
mobile the palette row shows it before you start. The agent runs inside that AmICited
Desktop server, so it gives you any restart steps and does not do them itself.

## In a terminal

If the app does not start, or triage does not work in the app, run:

```sh
amicited triage
```

It starts Claude Code or Codex in your terminal with the same instructions.
