pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
  }

  environment {
    AWS_REGION = 'us-east-1'
    AWS_ACCOUNT_ID = credentials('aws-account-id')
    ECR_REPOSITORY_PREFIX = 'vaultbank'
    IMAGE_TAG = "${BUILD_NUMBER}"
    REPORT_ROOT = "${env.WORKSPACE}/reports/devsecops"
    SONAR_PROJECT_KEY = 'vaultbank'
    DEPENDENCY_CHECK_FAIL_ON_CVSS = '7'
    TRIVY_FS_SEVERITY = 'HIGH,CRITICAL'
    TRIVY_IMAGE_SEVERITY = 'HIGH,CRITICAL'
    BUILD_FRONTEND_IMAGE = '1'
    BUILD_GATEWAY_IMAGE = '1'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.IMAGE_TAG = sh(returnStdout: true, script: 'git rev-parse --short=12 HEAD').trim()
        }
        sh 'git rev-parse HEAD > reports-git-commit.txt'
      }
    }

    stage('Repository Readiness') {
      steps {
        sh 'bash ci/scripts/validate-repository.sh'
      }
    }

    stage('Install Dependencies') {
      parallel {
        stage('Backend npm ci') {
          steps {
            dir('backend-service') {
              sh 'npm ci --legacy-peer-deps'
            }
          }
        }
        stage('Frontend npm ci') {
          steps {
            dir('frontend') {
              sh 'npm ci'
            }
          }
        }
      }
    }

    stage('Build and Unit Test') {
      parallel {
        stage('Backend lint, build, test') {
          steps {
            dir('backend-service') {
              sh 'npx eslint "{apps,libs,test}/**/*.ts" --max-warnings=0'
              sh 'npm run build:all'
              sh 'npm test'
              sh 'npx jest --coverage --runInBand --coverageThreshold=\'{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}\''
            }
          }
        }
        stage('Frontend typecheck and build') {
          steps {
            dir('frontend') {
              sh 'npm run typecheck'
              sh 'npm run build'
            }
          }
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'backend-service/coverage/**,frontend/dist/**', allowEmptyArchive: true
        }
      }
    }

    stage('Security Gates') {
      stages {
        stage('TruffleHog secrets') {
          steps {
            sh 'bash ci/scripts/run-trufflehog.sh'
          }
        }
        stage('Sonar SAST quality gate') {
          steps {
            withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
              sh 'bash ci/scripts/run-sonar.sh'
            }
          }
        }
        stage('OWASP Dependency-Check SCA') {
          steps {
            withCredentials([string(credentialsId: 'nvd-api-key', variable: 'NVD_API_KEY')]) {
              sh 'bash ci/scripts/run-dependency-check.sh'
            }
          }
        }
        stage('Trivy filesystem/config') {
          steps {
            sh 'bash ci/scripts/run-trivy-fs.sh'
          }
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'reports/devsecops/**', allowEmptyArchive: true
        }
      }
    }

    stage('Container Security') {
      stages {
        stage('Build images') {
          steps {
            sh 'bash ci/scripts/build-images.sh'
          }
        }
        stage('Trivy image scan') {
          steps {
            sh 'bash ci/scripts/scan-images.sh'
          }
        }
      }
    }

    stage('Publish Signed Images') {
      steps {
        sh 'bash ci/scripts/publish-images-ecr.sh'
        withCredentials([file(credentialsId: 'cosign-key', variable: 'COSIGN_KEY')]) {
          sh 'bash ci/scripts/sbom-sign-verify.sh'
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'reports/devsecops/**', allowEmptyArchive: true
        }
      }
    }

    stage('GitOps Staging') {
      when {
        branch 'main'
      }
      steps {
        sh 'bash ci/scripts/update-gitops-images.sh staging'
        sh 'kustomize build gitops/overlays/staging > reports/devsecops/staging-rendered.yaml'
        archiveArtifacts artifacts: 'reports/devsecops/staging-rendered.yaml', allowEmptyArchive: false
        echo 'Commit gitops/overlays/staging/kustomization.yaml to the GitOps repo or same repo branch watched by Argo CD.'
      }
    }

    stage('Staging Smoke and DAST') {
      when {
        branch 'main'
      }
      steps {
        sh 'bash ci/scripts/smoke-gateway.sh'
        sh 'bash ci/scripts/run-zap.sh'
        withCredentials([string(credentialsId: 'defectdojo-token', variable: 'DEFECTDOJO_TOKEN')]) {
          sh 'bash ci/scripts/import-defectdojo.sh'
        }
      }
    }

    stage('Production Approval') {
      when {
        branch 'main'
      }
      steps {
        input message: 'Promote signed image digests to production namespace?', ok: 'Promote'
        sh 'bash ci/scripts/update-gitops-images.sh prod'
        sh 'kustomize build gitops/overlays/prod > reports/devsecops/prod-rendered.yaml'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'reports/devsecops/**', allowEmptyArchive: true
    }
    failure {
      echo 'Pipeline failed. Do not merge or promote until the failing gate is remediated and rerun.'
    }
  }
}
