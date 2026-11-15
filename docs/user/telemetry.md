# Product usage data

The AmICited Desktop server sends product usage events to AmICited's PostHog Cloud project in
the EU (`eu.i.posthog.com`), associated with a hashed account or installation identifier. To
count how many installations one person uses, the server also sends hashed account identifiers:
your OpenAI and Claude accounts when you are signed in, and a random identifier for each device
that connects. Events include the provider, model, reasoning effort, permission mode, turn and
request results, duration, release channel, and token counts when available. Child-agent token
counts are reported separately from the main agent's. Model names are sent only when they appear
in a provider's public model list.

Events do not include prompts, responses, file contents, authentication tokens, conversation IDs,
raw provider events, or child-agent output.

FlowHunt handles this data under its [privacy policy](https://www.flowhunt.io/privacy-policy/).

## Turn usage data off

Usage data is on by default. To turn it off, open **Settings → Maintenance → Privacy** and turn off
**Usage analytics**. The switch applies to the selected environment's server. While it is off,
nothing is sent, and events the server has not sent yet are dropped.

You can also set `AMICITED_TELEMETRY_ENABLED=false` in the server's environment before starting
it. The web app in a browser, including one the `amicited` CLI opens, does not read this variable.
The desktop app reads `AMICITED_TELEMETRY_ENABLED` from your shell profile (for example `~/.zshrc`)
on macOS and Linux, so export it there and restart the app. On Windows, set it as a user
environment variable.

An administrator can turn usage data off for every user on a machine with a
[managed policy](./managed-policy.md#other-capabilities).

## Mobile app crash reports

The mobile app would send crash reports through the AmICited Link relay. That relay is not
available yet, so the mobile app sends no crash reports.

## Export diagnostics to your own receiver

To send traces, metrics, or logs to an OpenTelemetry receiver, open
**Settings > Maintenance > Diagnostics**, select an environment, and enter each signal's OTLP HTTP
endpoint under **OpenTelemetry export** (for example `http://localhost:4318/v1/traces`). Save, then
restart that environment's server. The receiver must be reachable from the server's machine.
**Test** sends an empty export from the server to check an endpoint before or after you save it;
saved endpoints are checked when the section opens. Checks send authentication headers only to
the signal's currently running endpoint and do not follow redirects. To check a new endpoint
that requires authentication, save it and restart the server first.

`AMICITED_OTLP_*_URL` and standard `OTEL_EXPORTER_OTLP_*` environment variables override the saved
settings. An overridden signal shows **Set by environment** and names the variable that set it, and its
**Test** checks the running endpoint instead of the field. For endpoints saved here or set with `AMICITED_OTLP_*_URL`, set `AMICITED_OTLP_HEADERS` for
receivers that need authentication and `AMICITED_OTLP_PROTOCOL=http/protobuf` for receivers that do
not accept JSON. An endpoint set with `OTEL_EXPORTER_OTLP_*` takes its headers and protocol from
`OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_EXPORTER_OTLP_PROTOCOL` instead.
