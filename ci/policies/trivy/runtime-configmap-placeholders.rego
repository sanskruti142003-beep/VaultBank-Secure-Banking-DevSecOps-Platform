package trivy

# These exceptions apply only to KSV-0109 findings for the two
# generated runtime ConfigMaps whose contents were separately
# validated as variable/hash placeholders.
#
# Actual Kubernetes Secrets remain outside these ConfigMaps.

default ignore = false

is_ksv_0109 {
    input.AVDID == "AVD-KSV-0109"
}

is_ksv_0109 {
    input.ID == "KSV-0109"
}

ignore {
    is_ksv_0109
    startswith(
        input.Message,
        "ConfigMap 'postgres-bootstrap-",
    )
}

ignore {
    is_ksv_0109
    startswith(
        input.Message,
        "ConfigMap 'rabbitmq-config-",
    )
}
