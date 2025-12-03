#!/usr/bin/env bash
# .platform/hooks/postdeploy/00_get_certificate.sh
sudo certbot -n -d ellarising.is404.net --nginx --agree-tos --email conradcb@byu.edu