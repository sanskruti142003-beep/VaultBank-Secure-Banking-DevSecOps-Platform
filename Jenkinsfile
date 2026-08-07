pipeline {
  agent any

  options {
    skipDefaultCheckout(true)
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '20'))
    disableConcurrentBuilds()
    timeout(time: 90, unit: 'MINUTES')
  }

  parameters {
    string(name: 'HARBOR_REGISTRY', defaultValue: 'harbor.vaultbank.internal:9443', description: 'Harbor Docker registry host:port; do not include https://')
    string(name: 'SONAR_HOST_URL', defaultValue: 'https://sonarcloud.io', description: 'SonarCloud or SonarQube URL')
    string(name: 'SONAR_ORGANIZATION', defaultValue: '', description: 'Required for SonarCloud, blank for many self-hosted SonarQube installs')
  }

  environment {
    REPORT_ROOT = "${env.WORKSPACE}/reports"
    HARBOR_PROJECT = 'vault-bank'
    COSIGN_KEY_REF = 'awskms:///alias/vaultbank-cosign'
    DEPENDENCY_CHECK_FAIL_ON_CVSS = '7'
    DEPENDENCY_CHECK_DATA_DIR = '/var/lib/jenkins/dependency-check-data'
    HARBOR_REGISTRY = "${params.HARBOR_REGISTRY}"
    SONAR_HOST_URL = "${params.SONAR_HOST_URL}"
    SONAR_ORGANIZATION = "${params.SONAR_ORGANIZATION}"
  }

  stages {
    stage('01 Checkout and metadata') {
      steps {
        cleanWs(deleteDirs: true)
        checkout([
          $class: 'GitSCM',
          branches: scm.branches,
          userRemoteConfigs: scm.userRemoteConfigs,
          extensions: [
            [$class: 'CloneOption', shallow: false, noTags: false, timeout: 20],
            [$class: 'CleanBeforeCheckout']
          ]
        ])
        sh '''
          set -Eeuo pipefail
          git fetch --tags --force --prune origin '+refs/heads/*:refs/remotes/origin/*'
          mkdir -p reports/phase-01-github
          git rev-parse HEAD | tee reports/phase-01-github/git-commit.txt
          git log --oneline --decorate -10 > reports/phase-01-github/git-log.txt
          git status --porcelain > reports/phase-01-github/git-status.txt
          branch="${BRANCH_NAME:-$(git branch --show-current)}"
          short_commit="$(git rev-parse --short=12 HEAD)"
          normalized_branch="$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
          printf 'IMAGE_TAG=%s-%s-%s\n' "$normalized_branch" "$short_commit" "$BUILD_NUMBER" > reports/phase-01-github/image-tag.env
        '''
        script {
          def props = readProperties file: 'reports/phase-01-github/image-tag.env'
          env.IMAGE_TAG = props['IMAGE_TAG']
        }
      }
    }

    stage('02 Repository contract validation') {
      steps {
        sh '''
          set -Eeuo pipefail
          bash ci/scripts/jenkins-preflight.sh
          bash ci/scripts/validate-repository.sh
          git diff --check
        '''
      }
    }

    stage('03 Backend/frontend deterministic quality gates') {
      parallel {
        stage('Backend quality') {
          steps {
            dir('backend-service') {
              sh '''
                set -Eeuo pipefail
                npm ci --legacy-peer-deps
                npm run lint:check
                npm run build:all
                npm test
                npm run test:cov:all
                git diff --exit-code -- package.json package-lock.json
              '''
            }
          }
        }
        stage('Frontend quality') {
          steps {
            dir('frontend') {
              sh '''
                set -Eeuo pipefail
                npm ci
                npm run typecheck
                npm run build
                git diff --exit-code -- package.json package-lock.json
              '''
            }
          }
        }
      }
    }

    stage('04 TruffleHog current-tree scan') {
      steps {
        sh 'bash ci/scripts/run-trufflehog.sh current'
      }
    }

    stage('05 TruffleHog full-history scan') {
      steps {
        sh 'bash ci/scripts/run-trufflehog.sh history'
      }
    }

    stage('06 SonarQube analysis') {
      steps {
        withSonarQubeEnv('SonarQube') {
          withCredentials([string(credentialsId: 'sonarqube-token', variable: 'SONAR_TOKEN')]) {
            sh 'bash ci/scripts/run-sonar.sh'
          }
        }
      }
    }

    stage('07 SonarQube quality gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('08 OWASP Dependency-Check') {
      steps {
        withCredentials([string(credentialsId: 'nvd-api-key', variable: 'NVD_API_KEY')]) {
          sh 'bash ci/scripts/run-dependency-check.sh'
        }
      }
    }

    stage('09 Trivy filesystem scan') {
      steps {
        sh 'bash ci/scripts/run-trivy-fs.sh'
      }
    }

    stage('10 Build six images') {
      steps {
        sh 'bash ci/scripts/build-images.sh'
      }
    }

    stage('11 Trivy image scans') {
      steps {
        sh 'bash ci/scripts/scan-images.sh'
      }
    }

    stage('12 Generate Syft SBOMs') {
      steps {
        sh 'bash ci/scripts/generate-sboms.sh'
      }
    }

    stage('13 Harbor login and push') {
      steps {
        withCredentials([
          usernamePassword(credentialsId: 'harbor-robot', usernameVariable: 'HARBOR_USERNAME', passwordVariable: 'HARBOR_PASSWORD'),
          file(credentialsId: 'harbor-ca-cert', variable: 'HARBOR_CA_CERT')
        ]) {
          sh 'bash ci/scripts/publish-harbor.sh push'
        }
      }
    }

    stage('14 Resolve digests') {
      steps {
        sh '''
          set -Eeuo pipefail
          test -s reports/phase-10-harbor/digest-manifest.jsonl
          wc -l reports/phase-10-harbor/digest-manifest.jsonl | awk '$1 != 6 { exit 1 }'
        '''
      }
    }

    stage('15 Post-push Trivy digest scans') {
      steps {
        sh 'bash ci/scripts/publish-harbor.sh scan'
      }
    }

    stage('16 Cosign sign') {
      steps {
        sh 'bash ci/scripts/publish-harbor.sh sign'
      }
    }

    stage('17 Cosign SBOM attest') {
      steps {
        sh 'bash ci/scripts/publish-harbor.sh attest'
      }
    }

    stage('18 Cosign verify') {
      steps {
        sh 'bash ci/scripts/publish-harbor.sh verify'
      }
    }

    stage('19 Publish release manifest') {
      steps {
        sh 'bash ci/scripts/publish-harbor.sh manifest'
      }
    }
  }

  post {
    always {
      sh '''
        set +e
        rm -f "${WORKSPACE}/cosign.key" "${WORKSPACE}/harbor-ca-cert.pem"
        find reports -type f -name '*.jsonl' -exec chmod 600 {} \\; 2>/dev/null
      '''
      archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true, fingerprint: true
      junit allowEmptyResults: true, testResults: 'reports/phase-05-dependency-check/dependency-check-junit.xml,backend-service/junit*.xml'
      cleanWs(deleteDirs: true, notFailBuild: true)
    }
    failure {
      echo 'NO-GO: a first-ten-phases gate failed. Do not merge or publish a release.'
    }
    success {
      echo 'GO: phases 1-10 completed and Harbor release manifest was generated.'
    }
  }
}
