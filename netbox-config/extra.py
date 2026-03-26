# Extra Netbox configuration — mounted at /etc/netbox/config/extra.py

# Allow unauthenticated API access (read-only)
LOGIN_REQUIRED = False

# Allow read access to all API endpoints without explicit object permissions
EXEMPT_VIEW_PERMISSIONS = ["*"]
