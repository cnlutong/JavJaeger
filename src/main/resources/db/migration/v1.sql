create table IF NOT EXISTS javjaeger.users
(
    id int auto_increment,
    username varchar(256) not null,
    password varchar(256) not null,
    hash varchar(256) not null,
    loginhash varchar(256),
    constraint id
        primary key (id)
);

create table IF NOT EXISTS javjaeger.aria
(
    id       int auto_increment,
    userid   int          not null,
    url      varchar(256) not null,
    password varchar(256) not null,
    constraint id
        primary key (id)
);

