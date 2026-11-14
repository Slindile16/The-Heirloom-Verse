package za.co.shoplink.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;

import java.util.List;

public record CreateOrderRequest(
        @NotBlank(message = "customerId is required") String customerId,
        @NotEmpty(message = "items must contain at least one item") List<@NotNull @Valid Item> items,
        @Size(max = 80) List<@NotNull @Valid Selection> selections) {

    public record Selection(@NotBlank String id, @NotBlank String option, @Min(1) @Max(10) int quantity) {}

    public record Item(
            @NotBlank(message = "productId is required") String productId,
            @Positive(message = "quantity must be greater than zero") int quantity) {
    }
}
