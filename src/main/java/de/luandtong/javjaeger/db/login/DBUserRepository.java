package de.luandtong.javjaeger.db.login;

import org.springframework.data.jdbc.repository.query.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;

public interface DBUserRepository extends CrudRepository<UserDTO, Long> {

    Boolean existsByHash(String hash);

//    @Query("DELETE FROM examalreadyexists WHERE lsfid=:lsfid")
    @Query("UPDATE javjaeger.users SET loginhash =:loginHash WHERE hash =:hash")
    void updateLoginHashByHash(@Param("loginHash") String loginHash,
                               @Param("hash") String hash);

    @Query("SELECT id FROM javjaeger.users WHERE hash=:hash")
    long getUserIDByHash(@Param("hash") String hash);

}


