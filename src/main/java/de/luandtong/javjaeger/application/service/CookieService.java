package de.luandtong.javjaeger.application.service;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
public class CookieService {
    public CookieService() {
    }

    public void saveCookie(HttpServletResponse response, String name, Object value) {
        Cookie cookie = new Cookie(name, Objects.toString(value));
        cookie.setSecure(true);
        cookie.setPath("/");
        response.addCookie(cookie);
    }

}
