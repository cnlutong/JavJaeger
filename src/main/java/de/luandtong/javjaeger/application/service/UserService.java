package de.luandtong.javjaeger.application.service;

import de.luandtong.javjaeger.application.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final UserHash userHash;

    public UserService(UserRepository userRepository, UserHash userHash) {
        this.userRepository = userRepository;
        this.userHash = userHash;
    }

    public boolean verification(String username, String password) {
        String thisUserOfHash = userHash.getHash(username, password);

        System.out.println("Hash: " + thisUserOfHash);
        if(userRepository.verify(thisUserOfHash)){
            return true;
        }else {
            return false;
        }
    }

    public String updateLoginHash(String username, String password) {
        String thisUserOfHash = userHash.getHash(username, password);
        String thisUserOfLoginHash = userHash.getHash(username, password, LocalDate.now());
        System.out.println("LoginHash: " + thisUserOfLoginHash);
        userRepository.updateLoginHash(thisUserOfHash, thisUserOfLoginHash);

        return thisUserOfLoginHash;

    }

    public long getUserIDByHash(String username, String password){
        String thisUserOfHash = userHash.getHash(username, password);
        return userRepository.getUserIDByHash(thisUserOfHash);
    }


}
