# Extra NetBox configuration — mounted at /etc/netbox/config/extra.py

# Allow unauthenticated API read access
LOGIN_REQUIRED = False
EXEMPT_VIEW_PERMISSIONS = ["*"]

# Required for API token creation in NetBox 4.x
API_TOKEN_PEPPERS = {
    0: "rackspares-netbox-token-pepper-change-me-in-production",
}
