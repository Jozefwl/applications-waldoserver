# Simple nginx 'CDN'

## Overview

This is a simple nginx webserver serving files from a folder.

Currently it is a helm chart set to deploy nginx with custom configuration. 

It can be changed in values.yaml file of the helm chart.
## Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)

## Installation

### Prerequisites

- k8s on target machine (see Configuration)
- helm

When not copying files manually:
- ansible
- python on target machine

### Install

1. Install CDN with HELM

Navigate to CDN folder then run:
```bash
helm install cdn-release cdn/ --values cdn/values.yaml --namespace cdn
```

2. Use in ansible playbook: 
```yaml
- name: Setup CDN
  hosts: "{{ TARGET_NODE }}"
  become: true
  roles:
    - role: 12_setup_cdn
      tags: [cdn, never]
```
---
#### When copying files manually:

1. Install CDN with HELM

Navigate to CDN folder then run:
```bash
helm install cdn-release cdn/ --values cdn/values.yaml --namespace cdn
```

2. Make directory **/opt/cdn**

3. Copy custom **index.html** into **/opt/cdn**

## Configuration

Change values in values.yaml in CDN/cdn

## Usage

1. Install with helm
2. Copy files to **/opt/cdn**
3. Get files by calling **domain.tld/filename.extension**