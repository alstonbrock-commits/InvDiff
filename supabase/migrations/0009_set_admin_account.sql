-- 0009: designate the admin account.
-- app_settings.admin_email makes any future signup with this address an admin
-- (handle_new_user, 0006); the update below promotes the already-existing row.

update app_settings set admin_email = 'alstonbrock@gmail.com';

update profiles set role = 'admin' where email = 'alstonbrock@gmail.com';
