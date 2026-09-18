package com.example.SpringJPA.Controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class FoodPageController {
    @GetMapping({"/", "/food"})
    public String foodPage() {
        return "Food";
    }
}
