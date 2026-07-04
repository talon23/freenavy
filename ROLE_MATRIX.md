# Free Navy role and permission matrix

All role values are stored in lowercase. Netlify Functions enforce these permissions server-side.

| Capability | Petty Officer | Officer | Vice President | President |
|---|:---:|:---:|:---:|:---:|
| Use normal member pages | Yes | Yes | Yes | Yes |
| Edit own RSI and Discord handles | Yes | Yes | Yes | Yes |
| Submit discoveries and reports | Yes | Yes | Yes | Yes |
| Manage warehouse stock and reservations | No | Yes | Yes | Yes |
| Generate warehouse shortage work orders | No | Yes | Yes | Yes |
| Review and approve submissions | No | Yes | Yes | Yes |
| Create and manage announcements | No | Yes | Yes | Yes |
| Invite new Petty Officers | No | Yes | Yes | Yes |
| Remove, suspend or reactivate Petty Officers | No | Yes | Yes | Yes |
| Invite or manage Officers | No | No | Yes | Yes |
| Assign member roles | No | No | Yes, below own role | Yes, below own role |
| Manage page content and visibility | No | No | Yes | Yes |
| Manage page backgrounds | No | No | Yes | Yes |
| Manage website settings | No | No | Yes | Yes |
| View audit history | No | No | Yes | Yes |
| Use LIVE source control | No | No | Yes | Yes |
| Export JSON backups | No | No | Yes | Yes |
| Appoint or remove a Vice President | No | No | No | Yes |
| Manage the President account | No | No | No | No other account can |

## Role values

```text
petty_officer
officer
vp
president
```

## Safety rules

- New accounts start as `petty_officer` unless a permitted inviter selects a higher role.
- Officers can invite and manage Petty Officers only.
- Vice Presidents can manage Petty Officers and Officers.
- Presidents can manage every lower role and appoint Vice Presidents.
- Nobody can change, suspend, ban or delete their own account.
- Nobody can manage an account at the same or a higher role.
- The President role can only be established by the bootstrap email or an existing President-level database record.
