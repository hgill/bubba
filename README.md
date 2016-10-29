README
Run schema.sql as root

In root:
create user 'bubbaserver'@'%' identified by 'password';
GRANT SELECT,INSERT,UPDATE,DELETE ON BUBBA.* TO 'bubbaserver'@'%';