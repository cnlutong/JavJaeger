package de.luandtong.javjaeger.application.repository;

public interface UserRepository {

    boolean verify(String thisUserOfHash);

    long getUserIDByHash(String thisUserOfHash);

    void updateLoginHash(String thisUserOfLoginHash, String thisUserOfHash);
}
