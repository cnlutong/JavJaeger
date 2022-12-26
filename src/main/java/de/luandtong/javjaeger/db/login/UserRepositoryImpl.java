package de.luandtong.javjaeger.db.login;

import de.luandtong.javjaeger.application.repository.UserRepository;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepositoryImpl implements UserRepository {

    private DBUserRepository dbUserRepository;

    public UserRepositoryImpl(DBUserRepository dbUserRepository) {
        this.dbUserRepository = dbUserRepository;
    }

    @Override
    public boolean verify(String thisUserOfHash) {
        return dbUserRepository.existsByHash(thisUserOfHash);
    }

    @Override
    public void updateLoginHash(String thisUserOfLoginHash, String thisUserOfHash) {
        dbUserRepository.updateLoginHashByHash(thisUserOfLoginHash, thisUserOfHash);
    }

    @Override
    public long getUserIDByHash(String thisUserOfHash) {
        return dbUserRepository.getUserIDByHash(thisUserOfHash);
    }


}
