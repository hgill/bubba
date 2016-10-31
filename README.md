README
Run schema.sql as root

In root:
drop user if exists 'bubbaserver'@'%';
create user 'bubbaserver'@'%' identified by 'password';
GRANT SELECT,INSERT,UPDATE,DELETE ON BUBBA.* TO 'bubbaserver'@'%';
GRANT EXECUTE ON BUBBA.* TO 'bubbaserver'@'%';