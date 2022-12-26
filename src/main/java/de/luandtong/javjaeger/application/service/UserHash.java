package de.luandtong.javjaeger.application.service;

import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.time.LocalDate;

@Service
public class UserHash {
    public String getHash(String username, String password){

        StringBuilder sb = new StringBuilder();
        sb.append(username);
        sb.append(password);
        return getDefHash(sb);
    }

    public String getHash(String username, String password, LocalDate locoDate){

        StringBuilder sb = new StringBuilder();
        sb.append(username);
        sb.append(password);
        sb.append(locoDate);
        return getDefHash(sb);
    }


    private String getDefHash(StringBuilder sb) {
        String combinedString = sb.toString();

        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(combinedString.getBytes());
            return bytesToHex(hash);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    private static String bytesToHex(byte[] hash) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : hash) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) hexString.append('0');
            hexString.append(hex);
        }
        return hexString.toString();
    }
}
