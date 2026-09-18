package com.example.SpringJPA.Serive;
import com.example.SpringJPA.Model.Food;
import com.example.SpringJPA.Reporistory.FoodReporistory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.math.BigDecimal;
@Service
public class FoodSerive 
{
    private final FoodReporistory foodRepository;
    public FoodSerive(FoodReporistory foodRepository) 
    {
        this.foodRepository = foodRepository;
    }
    public ResponseEntity<Food> createFood(Food food) 
    {
        validate(food);
        food.setId(null);
        return ResponseEntity.ok(foodRepository.save(food));
    }
    public List<Food> listFoods() { return foodRepository.findAll(); }

    public Food updateFood(Integer id, Food food) {
        validate(food);
        Food existing = foodRepository.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Food item not found"));
        existing.setFoodname(food.getFoodname());
        existing.setPrice(food.getPrice());
        existing.setAvailable(food.isAvailable());
        existing.setCategory(food.getCategory());
        existing.setDescription(food.getDescription());
        return foodRepository.save(existing);
    }

    public void deleteFood(Integer id) {
        Food existing = foodRepository.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Food item not found"));
        foodRepository.delete(existing);
    }

    private void validate(Food food) {
        if (food.getFoodname() == null || food.getFoodname().isBlank()
                || food.getFoodname().trim().length() > 255
                || !Double.isFinite(food.getPrice()) || food.getPrice() < 0.01
                || food.getPrice() > 999999.99
                || BigDecimal.valueOf(food.getPrice()).stripTrailingZeros().scale() > 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a food name and a price between 0.01 and 999999.99 with at most two decimal places");
        }
        food.setFoodname(food.getFoodname().trim());
        if (food.getCategory() == null || food.getCategory().isBlank()) food.setCategory("Main course");
        if (!List.of("Main course", "Starters", "Desserts", "Beverages", "Sides").contains(food.getCategory())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid food category");
        }
        if (food.getDescription() == null) food.setDescription("");
        food.setDescription(food.getDescription().trim());
        if (food.getDescription().length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Description must be 500 characters or fewer");
        }
    }
}
