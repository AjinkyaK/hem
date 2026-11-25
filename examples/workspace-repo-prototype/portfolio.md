---
# PROTOTYPE: example Workspace for a made-up Applicant. Every fact here is fictional.
# The front matter is the Fixed Facts. Code checks a Resume Draft against these exactly.
name: Priya Raman
contact:
  email: priya.raman@example.com
  phone: "+1 555 0142"
  location: Chicago, IL
  links:
    - label: LinkedIn
      url: https://www.linkedin.com/in/example-priya-raman
    - label: GitHub
      url: https://github.com/example-priya
years_experience: 8

employers:
  - name: Northwind Logistics
    location: Chicago, IL
    roles:            # a promotion is two roles under one employer, newest first
      - title: Senior Software Engineer
        start: 2022-03
        end: present
      - title: Software Engineer
        start: 2019-06
        end: 2022-03
  - name: Brightleaf Health
    location: Remote
    roles:
      - title: Software Engineer
        start: 2017-01
        end: 2019-05

education:
  - degree: B.S. Computer Science
    institution: University of Illinois Urbana-Champaign
    end: 2016-12

skills:               # every named technology the Applicant can claim
  languages: [Python, Go, TypeScript, SQL]
  backend: [FastAPI, gRPC, PostgreSQL, Redis, Kafka]
  infrastructure: [Kubernetes, Terraform, AWS, GitHub Actions, Prometheus, Grafana]
  frontend: [React]
---

## Northwind Logistics

### Shipment event pipeline (Senior Software Engineer)

- Replaced a nightly batch job with a Kafka-based event pipeline for shipment status updates.
- Status latency for carriers dropped from about 24 hours to under 2 minutes.
- Pipeline handles around 3 million events a day across 14 consumer services.
- Wrote the design doc and ran the review with three teams that own consumers.

### Internal deployment platform (Senior Software Engineer)

- Led a team of 4 engineers building a Kubernetes-based deployment platform with Terraform modules for each service.
- Moved 40 services off hand-managed EC2 hosts over 9 months.
- Median deploy time went from 45 minutes to 8 minutes.
- Mentored two engineers through their first on-call rotations.

### Rate quote API (Software Engineer)

- Built a FastAPI service that returns freight rate quotes from carrier contracts stored in PostgreSQL.
- Added a Redis cache that cut p95 latency from 900 ms to 140 ms.
- Service serves about 50,000 quotes a day to the customer portal.

### On-call and observability (Software Engineer)

- Set up Prometheus alerts and Grafana dashboards for the rate quote and booking services.
- Wrote runbooks that cut mean time to recovery from roughly 2 hours to 35 minutes over two quarters.

## Brightleaf Health

### Appointment reminders (Software Engineer)

- Built a Python worker that sends SMS and email appointment reminders.
- No-show rate fell from 18% to 11% at the 6 pilot clinics.

### Patient intake form (Software Engineer)

- Built a React intake form with field-level validation, replacing a paper form at 6 clinics.

## Independent projects

### Open-source Terraform linter rules

- Wrote and maintain a set of custom rules for an open-source Terraform linter, written in Go.
- About 300 GitHub stars and 12 outside contributors.
