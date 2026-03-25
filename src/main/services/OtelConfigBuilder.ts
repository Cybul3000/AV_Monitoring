import { getRegistryEntries } from '../modules/index'
import { getPreference } from '../preferences'

/**
 * Builds an OpenTelemetry collector YAML configuration for New Relic ingest.
 * Generates metric definitions for each device type in the device registry.
 */
export class OtelConfigBuilder {
  build(): string {
    const deviceTypes = getRegistryEntries()
    const newRelicKey = getPreference('pref:otelNewRelicKey') || '<YOUR_NEW_RELIC_INGEST_KEY>'

    const metricLines = deviceTypes
      .map(
        dt =>
          `      # ${dt.label} (${dt.type})\n` +
          `      av_monitoring_${dt.type.replace(/-/g, '_')}_status:\n` +
          `        description: "Health LED status for ${dt.label} (0=GREY, 1=GREEN, 2=AMBER, 3=RED)"\n` +
          `        unit: "{status}"\n` +
          `        gauge:\n` +
          `          value_type: int`
      )
      .join('\n\n')

    const yaml = `# AV Monitoring — OpenTelemetry Collector Configuration
# Generated: ${new Date().toISOString()}
# New Relic Ingest API: https://otlp.nr-data.net
#
# Deploy with: otelcol-contrib --config otel-collector.yaml

receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: 'av-monitoring'
          static_configs:
            - targets: ['localhost:9090']

  otlp:
    protocols:
      grpc:
        endpoint: "0.0.0.0:4317"
      http:
        endpoint: "0.0.0.0:4318"

processors:
  batch:
    timeout: 10s
  memory_limiter:
    check_interval: 1s
    limit_mib: 256

exporters:
  otlp:
    endpoint: "otlp.nr-data.net:4317"
    headers:
      api-key: "${newRelicKey}"
    tls:
      insecure: false

  logging:
    loglevel: info

service:
  pipelines:
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, batch]
      exporters: [otlp, logging]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp, logging]

# ── Metric Definitions ────────────────────────────────────────────────────────
# The following metrics are emitted by the AV Monitoring application.

metrics:
  definitions:
${metricLines}

    # Hierarchy aggregation metrics
    av_monitoring_room_status:
      description: "Aggregated health LED status for a meeting room"
      unit: "{status}"
      gauge:
        value_type: int
        attributes:
          - room_id
          - room_name
          - floor_id
          - office_id
          - region_id

    av_monitoring_region_status:
      description: "Aggregated health LED status for a region"
      unit: "{status}"
      gauge:
        value_type: int
        attributes:
          - region_id
          - region_name
`

    return yaml
  }
}
