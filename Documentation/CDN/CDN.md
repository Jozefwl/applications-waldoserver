# Simple nginx 'CDN'

## Overview

This is a simple nginx webserver serving files from a folder.

Currently it is hardcoded to use **cdn** namespace and serve files from **/opt/cdn** folder.
The persistent volume is set to **5Gi**.

Future plan is to either use a group_vars/all.yaml file for config of this CDN or have a separate file in the role.

## Contents

- [Automation](#automation)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)

## Automation

Automation is done using ansible, here are the following steps done in order:

1. Check target machine for kubeconfig and set it's location to the **rancher_kubeconfig** variable
2. Create **cdn** namespace.
3. Create **/opt/cdn** directory on target machine
4. Copy index.html to **/opt/cdn**
5. Apply PV
6. Apply PVC
7. Apply ConfigMap
8. Apply Deployment
9. Apply Service
10. Apply Ingress

## Installation

### Prerequisites

- k8s on target machine (see Configuration)
- ansible
- python on target machine

### Install

Use in ansible playbook: 
```yaml
- name: Setup CDN
  hosts: "{{ TARGET_NODE }}"
  become: true
  roles:
    - role: 12_setup_cdn
      tags: [cdn, never]
```

## Configuration

First things first, this is set up for a RKE2 k8s, so you need to fix getting the kubeconfig based on your setup in **tasks/main.yml** (probably just folder name)

### Extended configuration
Currently I haven't 'variabilified' the automation so a lot of stuff is hardcoded, you need to do it manually by finding variable names in the files:

- Change PV, PVC size in **pv.yaml** and **pvc.yaml**
- Change Ingress domain, etc. in **ingress.yaml**
- Nginx server config in **configmap.yaml**
- and so on...

## Usage

1. Install with playbook
2. Copy files to **/opt/cdn**
3. Get files by calling **domain.tld/filename.extension**