# AmICited Link troubleshooting

AmICited Link is not available yet: it needs an AmICited relay, which does not run
yet. Until it does, connect your devices over the local network, Tailscale, or
SSH; see [remote access](./remote-access.md). This page describes how Link will
behave once the relay is available.

An AmICited Link connection goes through four parts, in this order:

1. **This device** reaches AmICited Link over the internet.
2. **AmICited Link** checks your sign-in and the host's link.
3. **The host's tunnel** (cloudflared on the host) carries the request to the host.
4. **AmICited Desktop on the host** answers.

When a connection fails, open **Settings > Environments**, find the environment,
and select **Details**. The first part marked as failed is the cause. Find its
section below.

To see the host's side, run `amicited connect status` on the host, or open
**Settings > Sharing & access** on the host. Both check the host's AmICited Link
address from the host, and say why it fails. `amicited connect` runs the same check
when it finishes setup. This check cannot test another device's network. For a
problem on one device, use **Details** on that device.

## The host's tunnel is offline

AmICited Link could not reach the host's tunnel. This means one of these:

- The host is asleep, turned off, or offline.
- AmICited Desktop is not running on the host.
- The host's network blocks the tunnel. See
  [Port 7844 is blocked on the host](#port-7844-is-blocked-on-the-host).

Fix:

1. Make sure the host is awake and AmICited Desktop runs on it.
2. On the host, run `amicited connect status`. It names the problem on the host's side.
3. If the host was offline for a long time, AmICited Link removes its tunnel. Start
   AmICited Desktop on the host and update it to the latest version. It gets a new tunnel.

## Port 7844 is blocked on the host

The tunnel on the host connects out to Cloudflare on port 7844, with TCP and
UDP. Both tunnel protocols (QUIC and HTTP/2) use this port. When the host's
network blocks it, the tunnel cannot start, but normal web traffic still works.
The host looks online, so this problem is easy to miss.

Common causes:

- **A Tailscale exit node on the host.** All of the host's internet traffic goes
  through the exit node, and that network blocks port 7844. Turn off the exit
  node on the host with `tailscale set --exit-node=`, or allow outbound port
  7844 on the exit node's network.
- **A VPN on the host.** Work VPNs often block unknown ports. Ask for port 7844
  to be allowed, or use a direct route instead (see below).
- **A firewall or strict network.** Allow outbound TCP and UDP port 7844.

If you cannot unblock the port, you can connect without AmICited Link. When the
host and this device are on the same Tailscale network, add the host's
Tailscale address as a direct route. See
[Reach one machine several ways](./remote-access.md#reach-one-machine-several-ways).

## The tunnel works, but AmICited Desktop does not answer

The host's tunnel is up, but it cannot reach AmICited Desktop on the host. Common causes:

- AmICited Desktop on the host stopped, crashed, or is still starting.
- AmICited Desktop restarted on a different port, for example after an update, and the
  tunnel still points at the old port.
- The server binds only one network address with `AMICITED_HOST`. The tunnel
  sends requests to `127.0.0.1`, so the server must also listen there.

Fix: restart AmICited Desktop on the host. For the background service, run
`amicited service restart`. Then run `amicited connect status` on the host.

## The AmICited Link address does not resolve or answer

The host's AmICited Link address did not resolve, refused the connection, failed a
secure (TLS) connection, or did not answer in time.

Fix:

1. Make sure the host is awake and online.
2. On the host, run `amicited connect status`.
3. If the check fails only on the host, check the host's DNS, VPN, or proxy.

## This device can't reach AmICited Link

The problem is on this device's network, not on the host. This device could
not reach AmICited Link, or it reached AmICited Link but not the host's tunnel
address.

Fix:

1. Check this device's internet connection. On a captive or dead Wi-Fi network,
   the device can look online but cannot reach anything.
2. A VPN, firewall, ad blocker, or DNS filter on this device can block AmICited
   Link. Turn it off for a moment to test.
3. On iPhone, Connectivity Assist in the Wi-Fi settings can break AmICited Link.
   Turn it off to test.
4. Try another network, or add a direct route to the host, such as its
   Tailscale address. See
   [Reach one machine several ways](./remote-access.md#reach-one-machine-several-ways).

## Sign-in, account, or link problems

This device's AmICited Link sign-in is not ready yet, or AmICited Link does not have
an active link between your account and the host.

- **The host is linked to a different account.** Sign in to the same AmICited Link
  account on this device and on the host. On the host, run `amicited connect logout`,
  then `amicited connect`.
- **AmICited Link is off on the host, or the host only publishes agent activity.**
  On the host, open **Settings > Sharing & access** and turn **AmICited Link** on, or
  run `amicited connect`.
- **The host was linked, but the server did not apply the link yet.** Restart
  the server on the host: quit and reopen the AmICited Desktop app, run
  `amicited service restart`, or stop `amicited serve` and run it again.
- **This device's sign-in expired, or the host no longer accepts this
  device.** Sign out of AmICited Link and sign in again.
- **This device is still loading its AmICited Link sign-in.** Wait a moment;
  AmICited Desktop retries on its own. If it keeps waiting, reload or restart AmICited Desktop on
  this device.
- **Your account reached its tunnel limit.** Remove an environment you do not
  use from your AmICited Link account. Then restart AmICited Desktop on the host.

## The clock is off

AmICited Link signs requests with short-lived proofs. When the clock on this
device or the host is a few minutes wrong, AmICited Link rejects them. Turn on
automatic date and time on both devices, then retry.

## The host runs an older AmICited Desktop

This app needs a newer AmICited Desktop on the host. Update AmICited Desktop on the host. See
[Updating AmICited Desktop](./updating.md).

## AmICited Link returned an error

| Error                                                     | Fix                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment_link_limit_exceeded` or managed tunnel limit | Remove an unused environment, then restart AmICited Desktop on the host.                                                                                      |
| `auth_invalid` or `invalid_bearer`                        | Run `amicited connect login`. If credentials were revoked, run `amicited connect logout`, then `amicited connect` again. Restart the server after signing in. |
| Expired or invalid link proof                             | Check the host's date and time, update AmICited Desktop, then restart it.                                                                                     |
| HTTP 403 without a recognized error                       | Check relay access, proxies, and firewall rules. Keep any Cloudflare Ray ID for a bug report.                                                                 |
| HTTP 408, 429, or 5xx                                     | Wait a few minutes. AmICited Desktop retries temporary failures on its own.                                                                                   |

After you fix a permanent rejection, restart the host's server with
`amicited service restart`. For a foreground server, stop it and run `amicited serve` again.

If AmICited Desktop on the host disappears when SSH closes, see
[background-service troubleshooting](./background-service.md#troubleshooting).

## Report a problem

If none of this helps, email [support@flowhunt.io](mailto:support@flowhunt.io).
Include:

- The text from **Copy diagnostics** in the environment's **Details**.
- The output of `amicited connect status` on the host.
- The trace ID, if one is shown.
- If the tunnel dropped earlier, the host's tunnel log, `relay-client.ndjson`
  in the logs folder (`~/.amicited/userdata/logs` by default). It records when the
  tunnel connected, warned, exited, and restarted, with the tunnel token
  removed.
