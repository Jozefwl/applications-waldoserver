https://docs.ansible.com/projects/ansible/latest/collections/kubernetes/core/helm_module.html

https://stackoverflow.com/questions/62259002/merging-yaml-files-or-variables-in-ansible-for-patching-kubernetes-deployments

https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/combine_filter.html

https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/uri_module.html

https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_loops.html#registering-variables-with-a-loop


The main questions are: 
RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?

RQ4: What is the rollback time and recovery complexity for each strategy?

------------- recreate ------------------

RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?
Recreate doesn't support tenant-aware traffic routing, there is a single ingress already provided by the helm chart of the application, there is no routing granularity apart from the one provided by the application.
Implementation complexity is simple, Kubernetes' HELM supports the Recreate strategy, all that needs to be done is deploymentStrategy object has to be modified to specify it -> 'Recreate'.

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?
Empirical evaluation has shown that downtime is significant, on the testing workload about a minute. The application's latency is not applicable here because of the downtime, the new deployed application serves requests with same comparable latency as the previously deployed version. The error rates are high, about ~80% unavilability during the duration of the deployment, which took around 2 minutes - the end users see a 503 server unavailable error. If there is an ongoing job in the background, the pod does not terminate until the job is complete. 

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?
All of the tenants are unavailable, because the application serves all the tenants. Because of the nature of the Recreate deployment, all pods are terminated, making the application unavailable for a short time for all tenants.

RQ4: What is the rollback time and recovery complexity for each strategy?
Rollback takes around a minute, and is possible by using helm rollback command, which uses the previous used helm chart, containing the deployment strategy to roll back to the previous version of the application. Recovery complexity is simple, it is as complex as deploying the application, the old version has to be deployed to roll back.
------------- rolling and ramped ------------------
RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?


RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?

RQ4: What is the rollback time and recovery complexity for each strategy?


-------------- bluegreen ---------------

- two separate environments
- network router to route traffic to preview version (with host header replacement for the application's internal routing to work)
- swapping of production and previewslot traffic (by swapping target environment of ingressRoutes and production ingress)


RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?
This strategy supports tenant aware traffic routing, as the preview ingressroute can be swapped to production using an automation (not implemented into the automation, done manually for testing purposes), routing granularity is high, if implemented correctly. In most implementation cases, such as here, it's not very granluar, because we swap all of the tenants from preview to production and back. 

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?
This deployment strategy does not cause downtime, because we maintain two separate production environments at a time, latency is comparably the same in the production and preview versions, because of the external mariadb database the 

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?
The tenants on the same server experience a short increase in response time from ~50ms to about ~100ms for the duration of the deployment.

RQ4: What is the rollback time and recovery complexity for each strategy?

--------------- canary -----------------
https://traefik.io/glossary/kubernetes-deployment-strategies-blue-green-canary

RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?

RQ4: What is the rollback time and recovery complexity for each strategy?


------------- shadow -----------------

RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?
this strategy does not route existing tenants to the shadow deployment, as all the traffic is mirrored. There is no routing granularity, because all the traffic is mirrored. The implementation complexity is simple and can be done using traefik to mirror all the traffic to the shadow version.

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?

RQ4: What is the rollback time and recovery complexity for each strategy?


------- common errors ------------

(PUT INTO PART WITH POSSIBLE ERRORS DURING ROLLBACK)In case of database upgrades, the database would need to be backed up and the backup recovered before rolling back.
