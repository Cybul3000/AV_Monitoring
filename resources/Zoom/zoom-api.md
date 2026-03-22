# Zoom REST API — Module Reference

**Source**: Zoom API OpenAPI specifications (`Accounts.json`, `Rooms.json`, `Users.json`)  
**API version**: v2  
**Purpose**: Reference document for building the AV Monitoring Zoom module  
**Protocol confirmed for registry entry**: REST API over HTTPS (primary), Server-to-Server OAuth (auth)  
**Last reviewed**: 2026-03-22

---

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Authentication](#2-authentication)
3. [Common Conventions](#3-common-conventions)
4. [Zoom Rooms — Status & Health](#4-zoom-rooms--status--health)
5. [Zoom Rooms — Device Management](#5-zoom-rooms--device-management)
6. [Zoom Rooms — Controls](#6-zoom-rooms--controls)
7. [Zoom Rooms — Location Hierarchy](#7-zoom-rooms--location-hierarchy)
8. [Dashboard & Metrics](#8-dashboard--metrics)
9. [Users](#9-users)
10. [Account Settings](#10-account-settings)
11. [Roles](#11-roles)
12. [Module Implementation Notes](#12-module-implementation-notes)
13. [Reference Links](#13-reference-links)

---

## 1. API Overview

The Zoom REST API v2 provides programmatic access to Zoom account data including Zoom Rooms status, meeting analytics, device health, user management, and account configuration.

**Base URL**: `https://api.zoom.us/v2`  
**Protocol**: HTTPS only (TLS 1.2 minimum)  
**Data format**: JSON (`Content-Type: application/json`)  
**Pagination**: Cursor-based via `next_page_token` (15-minute expiry per token)

### API Source Files

| File | Coverage |
|------|----------|
| `Rooms.json` | Zoom Rooms management, location hierarchy, devices, settings, sensor data, workspace management, visitor management |
| `Accounts.json` | Dashboard/Metrics (meetings, Zoom Rooms health), account settings, roles, information barriers, survey management |
| `Users.json` | Users, groups, contact groups, divisions |

---

## 2. Authentication

### 2.1 Server-to-Server OAuth (Recommended for AV Monitoring)

Server-to-Server OAuth (also known as Account-level OAuth App) is the recommended method for non-interactive integrations such as AV monitoring. It does not require user interaction.

#### Setup Steps

1. Create a **Server-to-Server OAuth app** in the Zoom App Marketplace.
2. Note the **Account ID**, **Client ID**, and **Client Secret**.
3. Grant the required **OAuth scopes** on the app.
4. Request an access token using client credentials grant.

#### Token Request

```
POST https://zoom.us/oauth/token
  ?grant_type=account_credentials
  &account_id=<ACCOUNT_ID>

Authorization: Basic base64(<CLIENT_ID>:<CLIENT_SECRET>)
Content-Type: application/x-www-form-urlencoded
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "scope": "room:read:admin dashboard_zr:read:admin user:read:admin"
}
```

| Field | Description |
|-------|-------------|
| `access_token` | Bearer token — include in every API request |
| `expires_in` | Seconds until expiry. Default: `3600` (1 hour) |
| `scope` | Space-separated list of granted scopes |

> **Module recommendation**: Cache the token and refresh when `expires_in - buffer` threshold is reached (e.g., refresh at 5 minutes remaining). Do not request a new token on every API call.

#### Using the Token

```
GET https://api.zoom.us/v2/rooms
Authorization: Bearer <access_token>
Content-Type: application/json
```

### 2.2 JWT (Deprecated)

JWT-based authentication was deprecated by Zoom on **September 1, 2023**. Do not use JWT in new integrations.

### 2.3 Required OAuth Scopes by Function

| Function | Required Scopes |
|---------|----------------|
| List/get Zoom Rooms | `room:read:admin` |
| Granular room read | `zoom_rooms:read:list_rooms:admin`, `zoom_rooms:read:room:admin` |
| Zoom Room controls | `room:write:admin`, `zoom_rooms:update:room_control:admin` |
| List Zoom Room devices | `zoom_rooms:read:list_devices:admin` |
| Room sensor data | `zoom_rooms:read:sensor_data:admin` |
| Dashboard – Zoom Rooms metrics | `dashboard_zr:read:admin` |
| Dashboard – meeting quality | `dashboard_home:read:admin` |
| Dashboard – live meetings | `dashboard_meetings:read:admin` |
| List users | `user:read:admin` |
| Account settings | `account:read:admin` |
| List roles | `role:read:admin` |

---

## 3. Common Conventions

### 3.1 Base URL

All endpoints use the prefix: `https://api.zoom.us/v2`

```
GET https://api.zoom.us/v2/rooms
GET https://api.zoom.us/v2/rooms/{roomId}
GET https://api.zoom.us/v2/metrics/zoomrooms
```

### 3.2 HTTP Response Codes

| Code | Meaning |
|------|---------|
| `200` | OK — success with body |
| `201` | Created — resource created |
| `204` | No Content — success, no response body |
| `400` | Bad Request — invalid parameters or missing fields |
| `401` | Unauthorized — invalid or expired access token |
| `403` | Forbidden — insufficient scope or permissions |
| `404` | Not Found — resource does not exist |
| `429` | Too Many Requests — rate limit exceeded |

### 3.3 Rate Limits

Zoom enforces rate limits per-token. Labels map to approximate limits:

| Label | Approximate Limit |
|-------|------------------|
| `LIGHT` | 100 req/second |
| `MEDIUM` | 80 req/second |
| `HEAVY` | 60 req/second |

When `429` is returned, check the `Retry-After` response header for the number of seconds to wait before retrying.

> **Module recommendation**: Add exponential back-off on `429` responses. Space polls at minimum 5-second intervals for dashboards and 30-second intervals for room health checks.

### 3.4 Pagination

Endpoints returning lists support cursor-based pagination:

| Parameter | Type | Description |
|-----------|------|-------------|
| `page_size` | integer | Records per page. Default varies; max typically 300. |
| `next_page_token` | string | Token for next page. Expires after 15 minutes. |

Iterate until `next_page_token` is empty/absent in the response.

### 3.5 Date / Time Format

All date-time parameters use **ISO 8601 UTC**: `yyyy-MM-ddTHH:mm:ssZ`  
Date-only ranges (Dashboard): `yyyy-MM-dd`

---

## 4. Zoom Rooms — Status & Health

### 4.1 List Zoom Rooms

```
GET /rooms
```

Returns a paginated list of all Zoom Rooms with live status.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `status` | string | No | Filter by status: `Offline`, `Available`, `InMeeting`, `UnderConstruction` |
| `type` | string | No | Room type filter |
| `location_id` | string | No | Filter by parent location ID |
| `query_name` | string | No | Search by room name |
| `tag_ids` | string | No | Comma-separated tag IDs |
| `page_size` | integer | No | Default: 30 |
| `next_page_token` | string | No | Pagination cursor |

**Response:**

```json
{
  "page_size": 30,
  "next_page_token": "IAfJX3jsOLW7w3dokmFl84z...",
  "rooms": [
    {
      "id": "qMOLddnySIGGVycz8aX_JQ",
      "room_id": "49D7a0xPQvGQ2DCMZgSe7w",
      "name": "Conference Room A",
      "location_id": "SsxAmMT7QPOH19Kf9ZHz6g",
      "status": "Available",
      "tag_ids": ["ad82de3afb6d4738a736d13d551afdea"]
    }
  ]
}
```

| Field | Type | Values / Notes |
|-------|------|----------------|
| `id` | string | Zoom Room ID (use for Rooms API) |
| `room_id` | string | Dashboard Room ID (use for `/metrics/zoomrooms`) |
| `name` | string | Display name |
| `location_id` | string | Parent location in hierarchy |
| `status` | string | `Offline` \| `Available` \| `InMeeting` \| `UnderConstruction` |

**Required scopes**: `room:read:admin`, `zoom_rooms:read:list_rooms:admin`

> **Monitoring note**: Poll this endpoint to track room availability. Use `status=Offline` filter to alert on disconnected rooms.

---

### 4.2 Get Zoom Room Profile

```
GET /rooms/{roomId}
```

Returns full profile for a single room.

**Path parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `roomId` | Yes | Zoom Room ID from `GET /rooms` (`id` field) |

**Response structure:**

```json
{
  "basic": {
    "name": "Conference Room A",
    "display_name": "Conf A",
    "activation_code": "123456",
    "support_email": "av-support@example.com",
    "support_phone": "+15551234567",
    "zoom_room_type": "ZoomRoom",
    "location_id": "SsxAmMT7QPOH19Kf9ZHz6g",
    "capacity": 10
  },
  "device": {
    "device_profile_id": "Cs97wug2RTm5TNvuvk4yRw"
  },
  "setup": {
    "under_construction": false,
    "checkin_and_checkout": {
      "enable": true
    }
  }
}
```

| Field | Notes |
|-------|-------|
| `basic.zoom_room_type` | `ZoomRoom` \| `Kiosk` \| `StandaloneWhiteboard` \| `SchedulingDisplayOnly` \| `DigitalSignageOnly` |
| `basic.capacity` | Seating capacity for the room |
| `setup.under_construction` | If `true`, room is hidden from dashboard |

**Required scopes**: `room:read:admin`, `zoom_rooms:read:room:admin`

---

### 4.3 Get Zoom Room Sensor Data

```
GET /rooms/{roomId}/sensor_data
```

Returns environmental sensor data (temperature, humidity, CO₂, occupancy, noise level — depending on hardware installed).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `roomId` | string | Yes (path) | Zoom Room ID |
| `from` | string | Yes | Start datetime: `yyyy-MM-ddTHH:mm:ssZ` |
| `to` | string | Yes | End datetime: `yyyy-MM-ddTHH:mm:ssZ` |
| `page_size` | integer | No | Records per page |
| `next_page_token` | string | No | Pagination cursor |
| `device_id` | string | No | Filter by specific sensor device |
| `sensor_type` | string | No | Filter by sensor type |

**Response:**

```json
{
  "from": "2026-03-22T09:00:00Z",
  "to": "2026-03-22T10:00:00Z",
  "page_size": 30,
  "total_records": 12,
  "next_page_token": "",
  "sensor_data": [ ... ]
}
```

**Required scopes**: `room:read:admin`, `zoom_rooms:read:sensor_data:admin`

---

## 5. Zoom Rooms — Device Management

### 5.1 List Zoom Room Devices

```
GET /rooms/{roomId}/devices
```

Returns all hardware devices registered to a Zoom Room (controller, display, PC, scheduling display, etc.).

**Response:**

```json
{
  "devices": [
    {
      "device_name": "Zoom Rooms Controller",
      "device_type": "Controller",
      "app_version": "5.14.0",
      "ip_address": "192.168.1.50",
      "serial_number": "SN123456",
      "status": "Online"
    }
  ]
}
```

**Required scopes**: `room:read:admin`, `zoom_rooms:read:list_devices:admin`

---

### 5.2 List Device Profiles

```
GET /rooms/{roomId}/device_profiles
```

Returns device profiles associated with a room.

**Required scopes**: `room:read:admin`, `zoom_rooms:read:list_device_profiles:admin`

---

### 5.3 Get Device Information

```
GET /rooms/{roomId}/device_profiles/devices
```

Returns information about all devices linked to a device profile for a room.

**Required scopes**: `room:read:admin`

---

## 6. Zoom Rooms — Controls

### 6.1 Send Room Control Command

```
PATCH /rooms/{id}/events
```

Sends a control event to a Zoom Room (start meeting, leave meeting, mute/unmute, etc.).

**Path parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `id` | Yes | The Zoom Room ID |

**Request body example — start a meeting:**

```json
{
  "method": "start",
  "params": {
    "meeting_number": "123456789"
  }
}
```

**Common control methods:**

| Method | Description |
|--------|-------------|
| `start` | Start a scheduled meeting |
| `leave` | Leave the current meeting |
| `end` | End the current meeting for all participants |
| `mute_audio` | Mute/unmute microphone |
| `mute_video` | Turn camera on/off |

**Required scopes**: `room:write:admin`, `zoom_rooms:update:room_control:admin`

> **Note**: Room controls require the Zoom Room to be online and the Zoom app to be running on the room device.

---

## 7. Zoom Rooms — Location Hierarchy

Zoom Rooms can be organized in a location hierarchy: **Country → City → Campus → Building → Floor → Room**.

### 7.1 List Zoom Room Locations

```
GET /rooms/locations
```

Returns all locations in the account's hierarchy.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page_size` | integer | No | Default: 30 |
| `next_page_token` | string | No | Pagination cursor |
| `type` | string | No | Location type filter: `country`, `city`, `campus`, `building`, `floor` |
| `parent_location_id` | string | No | Filter by parent location |

**Required scopes**: `room:read:admin`, `zoom_rooms:read:list_locations:admin`

---

### 7.2 Get Location Profile

```
GET /rooms/locations/{locationId}
```

Returns profile for a specific location (name, address, support contacts, timezone).

**Required scopes**: `room:read:admin`, `zoom_rooms:read:location:admin`

---

### 7.3 Get Location Settings

```
GET /rooms/locations/{locationId}/settings
```

Returns meeting, alert, digital signage, or scheduling display settings applied to all rooms under a location.

**Parameters:**

| Name | Values | Description |
|------|--------|-------------|
| `setting_type` | `meeting` \| `alert` \| `signage` \| `scheduling_display` | Type of settings to retrieve |

**Required scopes**: `room:read:admin`, `zoom_rooms:read:location_settings:admin`

---

## 8. Dashboard & Metrics

Dashboard APIs provide aggregated health, quality, and usage data. All Dashboard endpoints require a **Business, Education, or API Plan** with Zoom Rooms or Meetings set up.

> **Date range restriction**: Dashboard data is available for the **last 6 months** only. The `from`/`to` range cannot exceed 1 month per call.

---

### 8.1 List Zoom Rooms Health (Dashboard)

```
GET /metrics/zoomrooms
```

Returns health and configuration data for all Zoom Rooms in the account dashboard view.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page_size` | integer | No | Default: 30 |
| `next_page_token` | string | No | Pagination cursor |

**Required scopes**: `dashboard_zr:read:admin`, `dashboard:read:admin`

> **Note**: The `room_id` returned in this response matches the `room_id` (not `id`) field from `GET /rooms`. Use this ID for all other `/metrics/zoomrooms` sub-paths.

---

### 8.2 Get Zoom Room Details (Dashboard)

```
GET /metrics/zoomrooms/{zoomroomId}
```

Returns configuration details and meeting history for a specific Zoom Room over a date range.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `zoomroomId` | string | Yes (path) | Dashboard Room ID (`room_id` from `GET /rooms`) |
| `from` | string | Yes | Start date: `yyyy-MM-dd` |
| `to` | string | Yes | End date: `yyyy-MM-dd` |
| `page_size` | integer | No | Default: 30 |
| `next_page_token` | string | No | Pagination cursor |

**Required scopes**: `dashboard_zr:read:admin`, `dashboard:read:admin`, `dashboard:read:zoomroom:admin`

---

### 8.3 Get Top 25 Zoom Rooms with Issues

```
GET /metrics/issues/zoomrooms
```

Returns up to 25 Zoom Rooms that experienced the most issues in a given month (e.g., disconnected hardware, bandwidth problems).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `from` | string | Yes | Start date: `yyyy-MM-dd` (within last 6 months) |
| `to` | string | Yes | End date: `yyyy-MM-dd` |

**Required scopes**: `dashboard_home:read:admin`, `dashboard:read:admin`

---

### 8.4 Get Issues for a Specific Zoom Room

```
GET /metrics/issues/zoomrooms/{zoomroomId}
```

Returns all issues logged for a specific Zoom Room in a given month.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `zoomroomId` | string | Yes (path) | Dashboard Room ID |
| `from` | string | Yes | Start date: `yyyy-MM-dd` |
| `to` | string | Yes | End date: `yyyy-MM-dd` |
| `page_size` | integer | No | Default: 30 |
| `next_page_token` | string | No | Pagination cursor |

**Required scopes**: `dashboard_home:read:admin`, `dashboard:read:admin`, `dashboard:read:issues_zoomroom:admin`

---

### 8.5 Get Top 25 Issues of Zoom Rooms

```
GET /metrics/zoomrooms/issues
```

Returns the top 25 most common issue types across all Zoom Rooms in a date range.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `from` | string | Yes | Start date: `yyyy-MM-dd` |
| `to` | string | Yes | End date: `yyyy-MM-dd` |

**Required scopes**: `dashboard_zr:read:admin`, `dashboard:read:admin`, `dashboard:read:issues_zoomroom:admin`

---

### 8.6 Get Meeting Quality Scores

```
GET /metrics/quality
```

Returns meeting quality scores for an account (good / fair / poor / bad) segmented by meeting or participant level.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `from` | string | Yes | Start date: `yyyy-MM-dd` |
| `to` | string | Yes | End date: `yyyy-MM-dd` |
| `type` | string | No | `meeting` (default) or `participants` |

**Response:**

```json
{
  "from": "2026-03-01",
  "to": "2026-03-22",
  "quality": {
    "good": 145,
    "fair": 23,
    "poor": 8,
    "bad": 2
  }
}
```

**Required scopes**: `dashboard_home:read:admin`, `dashboard:read:admin`, `dashboard:read:meeting_quality_score:admin`

---

### 8.7 List Live / Past Meetings

```
GET /metrics/meetings
```

Returns live or historical meetings in an account, including feature usage (audio, video, screen share, recording).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `type` | string | No | `live` \| `past` \| `pastOne` — default: `live` |
| `from` | string | Yes (for `past`) | Start date: `yyyy-MM-dd` |
| `to` | string | Yes (for `past`) | End date: `yyyy-MM-dd` |
| `page_size` | integer | No | Default: 30 |
| `next_page_token` | string | No | Pagination cursor |

**Required scopes**: `dashboard_meetings:read:admin`, `dashboard:read:admin`

---

### 8.8 Get Meeting Details

```
GET /metrics/meetings/{meetingId}
```

Returns quality and participant details for a specific meeting.

**Required scopes**: `dashboard_meetings:read:admin`, `dashboard:read:admin`, `dashboard:read:meeting:admin`

---

### 8.9 List Meeting Participants QoS

```
GET /metrics/meetings/{meetingId}/participants/qos
```

Returns per-participant Quality of Service data (bitrate, latency, jitter, packet loss) for a meeting.

**Required scopes**: `dashboard_meetings:read:admin`, `dashboard:read:admin`, `dashboard:read:list_meeting_participants_qos:admin`

---

## 9. Users

### 9.1 List Users

```
GET /users
```

Returns a paginated list of users in the account.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `status` | string | No | `active` \| `inactive` \| `pending` — default: `active` |
| `page_size` | integer | No | Default: 30; max: 300 |
| `role_id` | string | No | Filter by role ID |
| `license` | string | No | Filter by license type |
| `next_page_token` | string | No | Pagination cursor |

**Response:**

```json
{
  "page_size": 30,
  "total_records": 512,
  "next_page_token": "IAfJX3jsOLW7w3dokmFl84z...",
  "users": [
    {
      "id": "49D7a0xPQvGQ2DCMZgSe7w",
      "email": "user@example.com",
      "first_name": "Jane",
      "last_name": "Smith",
      "status": "active",
      "type": 2,
      "role_name": "Admin",
      "dept": "Engineering"
    }
  ]
}
```

**Required scopes**: `user:read:admin`

---

### 9.2 Get a User

```
GET /users/{userId}
```

Returns full profile for a single user. `{userId}` accepts a user ID or email address.

**Required scopes**: `user:read:admin`

---

### 9.3 Get User Presence Status

```
GET /users/{userId}/presence_status
```

Returns the current presence status of a user (Available, Away, Do Not Disturb, etc.).

**Required scopes**: `user:read:admin`

---

### 9.4 Get User Summary

```
GET /users/summary
```

Returns aggregate counts by user type and status for the entire account.

**Required scopes**: `user:read:admin`

---

## 10. Account Settings

### 10.1 Get Account Settings

```
GET /accounts/{accountId}/settings
```

Returns all account-level settings including meeting security, recording, and feature policies.

Use `me` as `{accountId}` to reference the current account.

**Required scopes**: `account:read:admin`

---

### 10.2 Get Account Zoom Rooms Profile

```
GET /rooms/account_profile
```

Returns the account-level Zoom Rooms profile (support contacts, setup defaults).

**Required scopes**: `room:read:admin`, `zoom_rooms:read:account_profile:admin`

---

### 10.3 Get Account Zoom Rooms Settings

```
GET /rooms/account_settings
```

Returns account-wide Zoom Rooms meeting and alert settings.

**Required scopes**: `room:read:admin`, `zoom_rooms:read:account_settings:admin`

---

## 11. Roles

### 11.1 List Roles

```
GET /roles
```

Returns all roles defined in the account with member counts.

**Parameters:**

| Name | Values | Description |
|------|--------|-------------|
| `type` | `common` \| `iq` | Role category — default: `common` |

**Required scopes**: `role:read:admin`

---

### 11.2 Get Role Information

```
GET /roles/{roleId}
```

Returns privileges and member count for a specific role.

**Required scopes**: `role:read:admin`

---

### 11.3 List Members in a Role

```
GET /roles/{roleId}/members
```

Returns all users assigned to a role.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `page_size` | integer | Max: 300 |
| `next_page_token` | string | Pagination cursor |

**Required scopes**: `role:read:admin`

---

## 12. Module Implementation Notes

### 12.1 ID Duality — `id` vs `room_id`

The `GET /rooms` endpoint returns two distinct IDs per room:

| Field | Used with | Description |
|-------|----------|-------------|
| `id` | Rooms API (`/rooms/{id}`, `/rooms/{id}/devices`, `/rooms/{id}/settings`) | Functional room ID |
| `room_id` | Dashboard API (`/metrics/zoomrooms/{zoomroomId}`) | Dashboard-specific room ID |

Always store both IDs when ingesting the room list.

---

### 12.2 Recommended Polling Strategy

| Endpoint | Suggested Interval | Purpose |
|----------|--------------------|---------|
| `GET /rooms` | 30 seconds | Room online/offline status |
| `GET /metrics/zoomrooms` | 5 minutes | Dashboard health overview |
| `GET /metrics/issues/zoomrooms` | 15 minutes | Active room issues |
| `GET /metrics/zoomrooms/{id}` | On-demand / per room | Deep-dive room diagnostics |
| `GET /rooms/{roomId}/sensor_data` | 5 minutes | Environmental data |
| `GET /metrics/meetings` (live) | 60 seconds | Active meeting monitoring |

---

### 12.3 Token Management

- Access tokens expire after **3600 seconds** (1 hour).
- Request a new token when `expires_in` falls below **300 seconds** (5 minutes).
- Store the token securely — do not log or expose the `access_token` value.
- The `Client Secret` must be stored encrypted at rest (never in plain text).

---

### 12.4 OAuth Scope Grouping

Request these scopes on the Server-to-Server OAuth app for full AV monitoring coverage:

```
room:read:admin
zoom_rooms:read:list_rooms:admin
zoom_rooms:read:room:admin
zoom_rooms:read:list_devices:admin
zoom_rooms:read:sensor_data:admin
zoom_rooms:read:list_locations:admin
zoom_rooms:read:location:admin
zoom_rooms:read:location_settings:admin
zoom_rooms:read:account_profile:admin
zoom_rooms:read:account_settings:admin
dashboard_zr:read:admin
dashboard_home:read:admin
dashboard_meetings:read:admin
dashboard:read:admin
user:read:admin
account:read:admin
role:read:admin
```

---

### 12.5 Error Handling

| HTTP Code | Action |
|-----------|--------|
| `401` | Re-authenticate — request a new access token |
| `403` | Check OAuth scope — missing permission |
| `404` | Room or resource removed — remove from registry |
| `429` | Back off — check `Retry-After` header, apply exponential back-off |
| `5xx` | Retry with back-off — transient Zoom server error |

---

### 12.6 Room Status Values

| Status | Description |
|--------|-------------|
| `Available` | Room is online and idle |
| `InMeeting` | Room is currently in a meeting |
| `Offline` | Room is offline or unreachable |
| `UnderConstruction` | Room is hidden from dashboard; maintenance mode |

---

## 13. Reference Links

| Resource | URL |
|----------|-----|
| Zoom API Reference | https://developers.zoom.us/docs/api/ |
| Server-to-Server OAuth Guide | https://developers.zoom.us/docs/internal-apps/ |
| OAuth Scopes Reference | https://developers.zoom.us/docs/integrations/oauth-scopes-overview/ |
| Rate Limits | https://developers.zoom.us/docs/api/rest/rate-limits/ |
| Dashboard API Overview | https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#tag/Dashboards |
| Zoom Rooms API Overview | https://developers.zoom.us/docs/api/rest/reference/zoom-rooms/methods/ |
