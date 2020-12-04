# magda

![Version: 0.0.59-alpha.0](https://img.shields.io/badge/Version-0.0.59--alpha.0-informational?style=flat-square)

A complete solution for managing, publishing and discovering government data, private and open. This chart includes the magda default deployment.

**Homepage:** <https://github.com/magda-io/magda>

## Source Code

* <https://github.com/magda-io/magda>

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| file://../magda-core | magda-core | 0.0.59-alpha.0 |
| https://charts.magda.io | magda-ckan-connector | 0.0.57-0 |
| https://charts.magda.io | magda-function-esri-url-processor | 0.0.57-0 |
| https://charts.magda.io | magda-function-history-report | 0.0.57-0 |
| https://charts.magda.io | magda-minion-broken-link | 0.0.57-0 |
| https://charts.magda.io | magda-minion-ckan-exporter | 0.0.57-0 |
| https://charts.magda.io | magda-minion-format | 0.0.57-0 |
| https://charts.magda.io | magda-minion-linked-data-rating | 0.0.57-0 |
| https://charts.magda.io | magda-minion-visualization | 0.0.57-0 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| ckan-connector-functions.createConfigMap | bool | `false` |  |
| ckan-connector-functions.createFunction | bool | `true` |  |
| ckan-connector-functions.includeCronJobs | bool | `false` |  |
| ckan-connector-functions.includeInitialJobs | bool | `false` |  |
| global.connectors.includeCronJobs | bool | `true` |  |
| global.connectors.includeInitialJobs | bool | `false` |  |
| global.openfaas.allowAdminOnly | bool | `true` |  |
| global.openfaas.enabled | bool | `true` |  |
| global.openfaas.functionNamespace | string | `"openfaas-fn"` |  |
| global.openfaas.mainNamespace | string | `"openfaas"` |  |
| global.openfaas.namespacePrefix | string | `""` |  |
| global.openfaas.secrets.authSecrets | bool | `true` |  |
| tags.all | bool | `true` |  |
| tags.connectors | bool | `false` |  |
| tags.minion-broken-link | bool | `false` |  |
| tags.minion-ckan-exporter | bool | `false` |  |
| tags.minion-format | bool | `false` |  |
| tags.minion-linked-data-rating | bool | `false` |  |
| tags.minion-visualization | bool | `false` |  |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.2.1](https://github.com/norwoodj/helm-docs/releases/v1.2.1)