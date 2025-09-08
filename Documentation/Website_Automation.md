# What This Does
This Ansible playbook automates the entire deployment pipeline:

1. Asks if you want to build new containers
2. Pulls latest commits from frontend/backend repos
3. Builds Docker containers for both frontend and backend
4. Tags and pushes containers to your registry
5. Deploys using bluegreen (Frontend and backend)

## Current hiccups

- I have metrics (Backend) and frontend in same repo, therefore automation is set up that way (building the container mostly)
- I currently have it set for my repo, which is exposed via a Service on nodeport 30999

## Future plans

- Use harbor for repo
- Helm-chartify my website
- Separate BE/FE


# Usage
Necessary evils:
- Set proper IP and cert location in `inventoryClusters.ini`
- Generate one if you don't have it yet `ssh-keygen -t ed25519 -C "propermail@properdomain.tld"`
- Copy the contents of your public key file -> ~/.ssh/id_ed25519.pub
- SSH to machine to verify, then run from local (current pc)

## 1. Go to playbooks dir:
```bash
cd Applications/Website/automation/playbooks/
```

## 2. Run funky command:
```bash
sudo ansible-playbook deployment-strategies.yaml -e TARGET_NODE=local -e deployment_strategy=blue-green
```

